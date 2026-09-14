import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service.js';
import { PlatformAdminService } from '../src/modules/platform/services/platform-admin.service.js';

describe('Platform Super-Admin Tenant Management & Global Analytics', () => {
  let prisma: PrismaService;
  let auditService: AuditService;
  let subService: SubscriptionsService;
  let adminService: PlatformAdminService;

  const superAdminId = 'usr_superadmin_001';

  beforeEach(() => {
    prisma = new PrismaService();
    auditService = new AuditService(prisma);
    subService = new SubscriptionsService(prisma);
    adminService = new PlatformAdminService(prisma, auditService, subService);

    // Setup multiple tenants
    prisma.memoryStore.tenants.set('tenant_alpha_1', {
      id: 'tenant_alpha_1',
      name: 'Alpha Academy',
      slug: 'alpha',
      status: 'ACTIVE',
      plan: 'growth',
    });

    prisma.memoryStore.subscriptions.set('sub_tenant_alpha_1', {
      id: 'sub_tenant_alpha_1',
      tenantId: 'tenant_alpha_1',
      tier: 'growth',
      planId: 'growth',
      status: 'ACTIVE',
    });

    prisma.memoryStore.tenants.set('tenant_beta_2', {
      id: 'tenant_beta_2',
      name: 'Beta High School',
      slug: 'beta',
      status: 'SUSPENDED',
      plan: 'starter',
    });
  });

  it('should aggregate global platform statistics across all tenants', async () => {
    const stats = await adminService.getGlobalStats();

    expect(stats.tenants.total).toBeGreaterThanOrEqual(2);
    expect(stats.tenants.active).toBeGreaterThanOrEqual(1);
    expect(stats.tenants.suspended).toBeGreaterThanOrEqual(1);
    expect(stats.financials.estimatedMrr).toBeGreaterThanOrEqual(249);
    expect(stats.financials.estimatedArr).toBe(stats.financials.estimatedMrr * 12);
  });

  it('should list tenants with computed metrics and filter by status and plan', async () => {
    const allTenants = await adminService.listTenants();
    expect(allTenants.length).toBeGreaterThanOrEqual(2);

    const suspendedTenants = await adminService.listTenants({ status: 'SUSPENDED' });
    expect(suspendedTenants.some((t: any) => t.id === 'tenant_beta_2')).toBe(true);
    expect(suspendedTenants.every((t: any) => t.status === 'SUSPENDED')).toBe(true);

    const searchResults = await adminService.listTenants({ search: 'Alpha' });
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].name).toBe('Alpha Academy');
  });

  it('should suspend and reactivate tenant with audited action records', async () => {
    // 1. Suspend tenant
    const suspendRes = await adminService.updateTenantStatus(
      'tenant_alpha_1',
      { status: 'SUSPENDED', reason: 'Compliance review pending' },
      superAdminId,
    );

    expect(suspendRes.status).toBe('SUSPENDED');
    const tenantSuspended = prisma.memoryStore.tenants.get('tenant_alpha_1');
    expect(tenantSuspended.status).toBe('SUSPENDED');

    // Verify audit record was created
    const logs = await auditService.list('tenant_alpha_1');
    const statusLog = logs.find((l) => l.action === 'TENANT_STATUS_CHANGED');
    expect(statusLog).toBeDefined();
    expect(statusLog?.actorUserId).toBe(superAdminId);
    expect(statusLog?.afterData.status).toBe('SUSPENDED');

    // 2. Reactivate tenant
    const reactivateRes = await adminService.updateTenantStatus(
      'tenant_alpha_1',
      { status: 'ACTIVE', reason: 'Compliance review cleared' },
      superAdminId,
    );
    expect(reactivateRes.status).toBe('ACTIVE');
  });

  it('should update tenant plan tier and feature overrides', async () => {
    const updateRes = await adminService.updateTenantPlan(
      'tenant_alpha_1',
      { plan: 'enterprise', notes: 'Upgraded to Enterprise tier with Custom Domain SLA' },
      superAdminId,
    );

    expect(updateRes.plan).toBe('enterprise');
    expect(updateRes.features.customDomain).toBe(true);
    expect(updateRes.features.dedicatedSla).toBe(true);

    const sub = prisma.memoryStore.subscriptions.get('sub_tenant_alpha_1');
    expect(sub.maxStudents).toBe(10000);
    expect(sub.maxCampuses).toBe(10);
  });
});
