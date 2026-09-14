import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TenancyService } from '../src/modules/tenancy/tenancy.service.js';
import { CustomDomainService } from '../src/modules/tenancy/custom-domain.service.js';
import { CloudflareDomainProvider } from '../src/modules/tenancy/cloudflare-domain.provider.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';

describe('Custom Domain & SSL Infrastructure (Task 5)', () => {
  let tenancyService: TenancyService;
  let customDomainService: CustomDomainService;
  let domainProvider: CloudflareDomainProvider;
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;

  const tenantA = 'tenant_dom_alpha_01';
  const tenantB = 'tenant_dom_beta_02';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);

    domainProvider = new CloudflareDomainProvider();
    customDomainService = new CustomDomainService(prisma, domainProvider);
    tenancyService = new TenancyService(prisma, customDomainService);

    await rlsHelper.withBypassContext(async (tx) => {
      await tx.tenantDomain.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });

      await tx.tenant.create({
        data: { id: tenantA, name: 'Domain Alpha School', slug: 'domain-alpha' },
      });
      await tx.tenant.create({
        data: { id: tenantB, name: 'Domain Beta School', slug: 'domain-beta' },
      });
    });
  });

  afterAll(async () => {
    await rlsHelper.withBypassContext(async (tx) => {
      await tx.tenantDomain.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    });
    await prisma.onModuleDestroy();
  });

  it('1. Add Custom Domain: Generates verification challenge in PENDING state', async () => {
    const result = await tenancyService.addCustomDomain(tenantA, 'portal.alphaschool.edu.ng');

    expect(result.domain).toBe('portal.alphaschool.edu.ng');
    expect(result.status).toBe('PENDING_VERIFICATION');
    expect(result.verificationToken).toBeDefined();
    expect(result.requiredDnsRecords.length).toBe(2);

    const txtRecord = result.requiredDnsRecords.find((r) => r.type === 'TXT');
    expect(txtRecord?.name).toBe('_saas-verify.portal.alphaschool.edu.ng');
    expect(txtRecord?.value).toContain(result.verificationToken);
  });

  it('2. Domain Conflict Prevention: Blocks duplicate registration across tenants', async () => {
    // Tenant B attempts to register the same domain as Tenant A
    await expect(
      tenancyService.addCustomDomain(tenantB, 'portal.alphaschool.edu.ng'),
    ).rejects.toThrow(/already registered/);
  });

  it('3. Domain Validation: Rejects invalid or localhost domains', async () => {
    await expect(
      tenancyService.addCustomDomain(tenantA, 'localhost'),
    ).rejects.toThrow(/Localhost domains cannot be configured/);
  });

  it('4. DNS Verification: Fails when DNS TXT or CNAME record is not published', async () => {
    // Attempt verification on unpropagated live domain
    const result = await tenancyService.verifyCustomDomain(tenantA, 'portal.alphaschool.edu.ng');
    expect(result.verified).toBe(false);
    expect(result.message).toContain('DNS verification failed');
  });

  it('5. DNS Verification & SSL Provisioning: Activates domain and SSL on valid DNS challenge', async () => {
    // Mock successful DNS verification for simulation test
    const verifySpy = vi.spyOn(domainProvider, 'verifyDns').mockResolvedValueOnce({
      verified: true,
      cnameMatches: true,
      txtMatches: true,
      detectedCnames: ['custom.yoursaas.com'],
      detectedTxts: ['saas-verify=mock_token'],
      expectedCname: 'custom.yoursaas.com',
      expectedTxt: 'saas-verify=mock_token',
    });

    const sslSpy = vi.spyOn(domainProvider, 'provisionSsl').mockResolvedValueOnce({
      sslStatus: 'ACTIVE',
      certificateId: 'cert_cloudflare_123',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
    });

    const result = await tenancyService.verifyCustomDomain(tenantA, 'portal.alphaschool.edu.ng');

    expect(result.verified).toBe(true);
    expect(result.ssl.sslStatus).toBe('ACTIVE');
    expect(result.domain.isVerified).toBe(true);
    expect(result.domain.sslStatus).toBe('ACTIVE');

    verifySpy.mockRestore();
    sslSpy.mockRestore();
  });

  it('6. Primary Domain Selection: Can set verified custom domain as primary', async () => {
    const result = await tenancyService.setPrimaryDomain(tenantA, 'portal.alphaschool.edu.ng');
    expect(result.success).toBe(true);
    expect(result.primaryDomain).toBe('portal.alphaschool.edu.ng');
  });

  it('7. Domain Removal: Successfully deletes domain and cleans up reverse-proxy hostname', async () => {
    // Add another domain and verify it so portal.alphaschool.edu.ng can be unset from primary and deleted
    await tenancyService.addCustomDomain(tenantA, 'secondary.alphaschool.edu.ng');

    const verifySpy = vi.spyOn(domainProvider, 'verifyDns').mockResolvedValueOnce({
      verified: true,
      cnameMatches: true,
      txtMatches: true,
      detectedCnames: ['custom.yoursaas.com'],
      detectedTxts: ['saas-verify=mock_token'],
      expectedCname: 'custom.yoursaas.com',
      expectedTxt: 'saas-verify=mock_token',
    });

    await tenancyService.verifyCustomDomain(tenantA, 'secondary.alphaschool.edu.ng');
    verifySpy.mockRestore();

    await tenancyService.setPrimaryDomain(tenantA, 'secondary.alphaschool.edu.ng');

    const removeResult = await tenancyService.removeCustomDomain(tenantA, 'portal.alphaschool.edu.ng');
    expect(removeResult.success).toBe(true);
    expect(removeResult.message).toContain('removed successfully');
  });
});
