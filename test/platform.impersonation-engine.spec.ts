import { describe, it, expect, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { ImpersonationService } from '../src/modules/platform/services/impersonation.service.js';

describe('Support Impersonation Engine & Token Generation', () => {
  let prisma: PrismaService;
  let jwtService: JwtService;
  let auditService: AuditService;
  let impersonationService: ImpersonationService;

  const superAdmin = {
    id: 'usr_superadmin_01',
    email: 'superadmin@platform.io',
    firstName: 'Platform',
    lastName: 'Admin',
  };

  const targetTenantId = 'tenant_support_school_100';
  const targetUserId = 'usr_school_principal_01';

  beforeEach(() => {
    prisma = new PrismaService();
    jwtService = new JwtService({ secret: 'test_jwt_secret_key_12345' });
    auditService = new AuditService(prisma);
    impersonationService = new ImpersonationService(prisma, jwtService, auditService);

    // Setup tenant and user
    prisma.memoryStore.tenants.set(targetTenantId, {
      id: targetTenantId,
      name: 'St. Jude International School',
      slug: 'stjude',
      status: 'ACTIVE',
    });

    prisma.memoryStore.users.set(targetUserId, {
      id: targetUserId,
      tenantId: targetTenantId,
      email: 'principal@stjude.edu',
      firstName: 'Sister',
      lastName: 'Mary',
      isActive: true,
      role: 'school_admin',
    });
  });

  it('should initiate time-bound support impersonation with mandatory justification', async () => {
    // 1. Rejection when reason is missing or too short
    await expect(
      impersonationService.startImpersonation(superAdmin, {
        targetTenantId,
        targetUserId,
        reason: 'no',
      }),
    ).rejects.toThrow(/mandatory justification/i);

    // 2. Successful impersonation start
    const result = await impersonationService.startImpersonation(superAdmin, {
      targetTenantId,
      targetUserId,
      reason: 'Support Ticket #5821 - Debugging fee waiver reconciliation error',
      durationMinutes: 45,
    });

    expect(result.sessionId).toBeDefined();
    expect(result.token).toBeDefined();
    expect(result.durationMinutes).toBe(45);
    expect(result.targetTenant.id).toBe(targetTenantId);
    expect(result.targetUser.email).toBe('principal@stjude.edu');
    expect(result.impersonator.email).toBe('superadmin@platform.io');

    // 3. Verify JWT claims
    const decoded: any = jwtService.verify(result.token);
    expect(decoded.sub).toBe(targetUserId);
    expect(decoded.tenantId).toBe(targetTenantId);
    expect(decoded.isImpersonating).toBe(true);
    expect(decoded.impersonatorUserId).toBe(superAdmin.id);
    expect(decoded.impersonatorEmail).toBe(superAdmin.email);
    expect(decoded.impersonationSessionId).toBe(result.sessionId);

    // 4. Verify session in memory store
    const session = prisma.memoryStore.impersonationSessions.get(result.sessionId);
    expect(session.isActive).toBe(true);
    expect(session.reason).toContain('Support Ticket #5821');
  });

  it('should validate active sessions and reject expired or terminated sessions', async () => {
    const startRes = await impersonationService.startImpersonation(superAdmin, {
      targetTenantId,
      targetUserId,
      reason: 'Support Ticket #7712 - Gradebook issue',
      durationMinutes: 30,
    });

    // 1. Session is currently valid
    const validCheck = await impersonationService.validateSession(startRes.sessionId);
    expect(validCheck.valid).toBe(true);

    // 2. Terminate session early
    const termRes = await impersonationService.terminateImpersonation(
      startRes.sessionId,
      superAdmin.id,
      { reason: 'Support task completed by staff' },
    );
    expect(termRes.status).toBe('TERMINATED');

    // 3. Re-validation should now fail
    const invalidCheck = await impersonationService.validateSession(startRes.sessionId);
    expect(invalidCheck.valid).toBe(false);
    expect(invalidCheck.reason).toContain('terminated or revoked');
  });

  it('should list impersonation sessions with filtering options', async () => {
    await impersonationService.startImpersonation(superAdmin, {
      targetTenantId,
      targetUserId,
      reason: 'Inspection session 1',
    });

    const sessions = await impersonationService.listSessions({ tenantId: targetTenantId });
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0].tenantId).toBe(targetTenantId);
  });
});
