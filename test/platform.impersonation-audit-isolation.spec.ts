import { describe, it, expect, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { ImpersonationService } from '../src/modules/platform/services/impersonation.service.js';
import { SystemPermissions } from '../src/common/constants/permissions.js';

describe('Impersonation Audit Logging, Dual Identity & Permissions', () => {
  let prisma: PrismaService;
  let jwtService: JwtService;
  let auditService: AuditService;
  let impersonationService: ImpersonationService;

  const superAdmin = {
    id: 'usr_superadmin_01',
    email: 'superadmin@platform.io',
  };

  const tenantA = 'tenant_mercury_100';
  const tenantB = 'tenant_venus_200';
  const userA = 'usr_principal_mercury';

  beforeEach(() => {
    prisma = new PrismaService();
    jwtService = new JwtService({ secret: 'test_secret' });
    auditService = new AuditService(prisma);
    impersonationService = new ImpersonationService(prisma, jwtService, auditService);

    prisma.memoryStore.tenants.set(tenantA, {
      id: tenantA,
      name: 'Mercury College',
      slug: 'mercury',
      status: 'ACTIVE',
    });

    prisma.memoryStore.tenants.set(tenantB, {
      id: tenantB,
      name: 'Venus High',
      slug: 'venus',
      status: 'ACTIVE',
    });

    prisma.memoryStore.users.set(userA, {
      id: userA,
      tenantId: tenantA,
      email: 'principal@mercury.edu',
      isActive: true,
      role: 'school_admin',
    });
  });

  it('should record dual identity in audit logs when actions are performed under impersonation', async () => {
    // 1. Start impersonation session
    const sessionRes = await impersonationService.startImpersonation(superAdmin, {
      targetTenantId: tenantA,
      targetUserId: userA,
      reason: 'Ticket #9901 - Assisting with timetable generation issue',
    });

    // 2. Perform a simulated action within the tenant under impersonation
    await auditService.log({
      tenantId: tenantA,
      actorUserId: userA,
      impersonatedBy: superAdmin.id,
      impersonationSessionId: sessionRes.sessionId,
      isImpersonated: true,
      action: 'UPDATE_TIMETABLE_ENTRY',
      resourceType: 'TIMETABLE_ENTRY',
      resourceId: 'entry_math_101',
      beforeData: { period: 1 },
      afterData: { period: 2 },
    });

    // 3. Query tenant audit logs
    const tenantLogs = await auditService.list(tenantA);
    const impersonatedLog = tenantLogs.find((l) => l.action === 'UPDATE_TIMETABLE_ENTRY');

    expect(impersonatedLog).toBeDefined();
    expect(impersonatedLog?.actorUserId).toBe(userA);
    expect(impersonatedLog?.impersonatedBy).toBe(superAdmin.id);
    expect(impersonatedLog?.isImpersonated).toBe(true);
    expect(impersonatedLog?.impersonationSessionId).toBe(sessionRes.sessionId);

    // 4. Query platform-level impersonation logs across all tenants
    const platformLogs = await auditService.listPlatformAuditLogs({
      isImpersonated: true,
    });

    expect(platformLogs.length).toBeGreaterThanOrEqual(2); // start + timetable edit
    expect(platformLogs.every((l) => l.isImpersonated === true)).toBe(true);
  });

  it('should prevent cross-tenant leak in tenant-scoped audit lists', async () => {
    // Log action in Tenant A
    await auditService.log({
      tenantId: tenantA,
      actorUserId: userA,
      action: 'TENANT_A_ACTION',
      resourceType: 'STUDENT',
    });

    // Log action in Tenant B
    await auditService.log({
      tenantId: tenantB,
      actorUserId: 'usr_b',
      action: 'TENANT_B_ACTION',
      resourceType: 'STUDENT',
    });

    const logsA = await auditService.list(tenantA);
    expect(logsA.some((l) => l.action === 'TENANT_A_ACTION')).toBe(true);
    expect(logsA.some((l) => l.action === 'TENANT_B_ACTION')).toBe(false);

    const logsB = await auditService.list(tenantB);
    expect(logsB.some((l) => l.action === 'TENANT_B_ACTION')).toBe(true);
    expect(logsB.some((l) => l.action === 'TENANT_A_ACTION')).toBe(false);
  });

  it('should verify platform admin and impersonation system permissions', () => {
    expect(SystemPermissions.PLATFORM_ADMIN).toBe('platform.admin');
    expect(SystemPermissions.IMPERSONATE_USER).toBe('impersonate.user');
    expect(SystemPermissions.AUDIT_VIEW).toBe('audit.view');
  });
});
