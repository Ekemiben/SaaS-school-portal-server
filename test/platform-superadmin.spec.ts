import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { PermissionsGuard } from '../src/common/guards/permissions.guard.js';
import { TenantGuard } from '../src/common/guards/tenant.guard.js';
import { PlatformAdminGuard } from '../src/common/guards/platform-admin.guard.js';
import { RolesGuard } from '../src/common/guards/roles.guard.js';
import { Reflector } from '@nestjs/core';
import { PlatformUserService } from '../src/modules/platform/services/platform-user.service.js';
import { ImpersonationService } from '../src/modules/platform/services/impersonation.service.js';
import { PlatformAdminService } from '../src/modules/platform/services/platform-admin.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { SystemPermissions, PlatformRoles } from '../src/common/constants/permissions.js';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('Platform-Level Super Admin Architecture — 15 Required Verification Scenarios', () => {
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authService: AuthService;
  let auditService: AuditService;
  let platformUserService: PlatformUserService;
  let impersonationService: ImpersonationService;
  let platformAdminService: PlatformAdminService;

  let reflector: Reflector;
  let permissionsGuard: PermissionsGuard;
  let tenantGuard: TenantGuard;
  let platformAdminGuard: PlatformAdminGuard;
  let rolesGuard: RolesGuard;

  // Mock test users
  const passwordPlain = 'SuperSecret2026!';
  let passwordHash: string;

  let superAdminUser: any;
  let platformAdminUser: any;
  let platformSupportUser: any;
  let tenantAUser: any;
  let tenantBUser: any;

  beforeEach(async () => {
    prisma = new PrismaService();
    jwtService = new JwtService({
      secret: 'dev_access_secret_key_change_in_production_123',
    });
    authService = new AuthService(prisma, jwtService);
    auditService = new AuditService(prisma);
    platformUserService = new PlatformUserService(prisma, auditService);
    impersonationService = new ImpersonationService(prisma, jwtService, auditService);
    platformAdminService = new PlatformAdminService(prisma, auditService);

    reflector = new Reflector();
    permissionsGuard = new PermissionsGuard(reflector);
    tenantGuard = new TenantGuard(reflector);
    platformAdminGuard = new PlatformAdminGuard();
    rolesGuard = new RolesGuard(reflector);

    passwordHash = await bcrypt.hash(passwordPlain, 10);

    // 1. SUPER_ADMIN user (tenantId = null)
    superAdminUser = {
      id: 'super_admin_001',
      tenantId: null,
      email: 'superadmin@platform.io',
      passwordHash,
      firstName: 'Platform',
      lastName: 'SuperAdmin',
      isActive: true,
      isPlatformAdmin: true,
      platformRole: PlatformRoles.SUPER_ADMIN,
      role: PlatformRoles.SUPER_ADMIN,
      roles: [PlatformRoles.SUPER_ADMIN],
      permissions: ['*'],
      permissionIds: ['*'],
      campusIds: [],
    };
    prisma.memoryStore.users.set(superAdminUser.id, superAdminUser);

    // 2. PLATFORM_ADMIN user (tenantId = null, specific permissions)
    platformAdminUser = {
      id: 'plat_admin_001',
      tenantId: null,
      email: 'admin@platform.io',
      passwordHash,
      firstName: 'Platform',
      lastName: 'Admin',
      isActive: true,
      isPlatformAdmin: true,
      platformRole: PlatformRoles.PLATFORM_ADMIN,
      role: PlatformRoles.PLATFORM_ADMIN,
      roles: [PlatformRoles.PLATFORM_ADMIN],
      permissions: [
        SystemPermissions.PLATFORM_TENANT_VIEW,
        SystemPermissions.PLATFORM_TENANT_UPDATE,
        SystemPermissions.PLATFORM_USER_VIEW,
      ],
      permissionIds: [
        SystemPermissions.PLATFORM_TENANT_VIEW,
        SystemPermissions.PLATFORM_TENANT_UPDATE,
        SystemPermissions.PLATFORM_USER_VIEW,
      ],
      campusIds: [],
    };
    prisma.memoryStore.users.set(platformAdminUser.id, platformAdminUser);

    // 3. PLATFORM_SUPPORT user (tenantId = null, support permissions)
    platformSupportUser = {
      id: 'plat_supp_001',
      tenantId: null,
      email: 'support@platform.io',
      passwordHash,
      firstName: 'Platform',
      lastName: 'Support',
      isActive: true,
      isPlatformAdmin: true,
      platformRole: PlatformRoles.PLATFORM_SUPPORT,
      role: PlatformRoles.PLATFORM_SUPPORT,
      roles: [PlatformRoles.PLATFORM_SUPPORT],
      permissions: [
        SystemPermissions.PLATFORM_TENANT_VIEW,
        SystemPermissions.PLATFORM_IMPERSONATION_START,
        SystemPermissions.PLATFORM_AUDIT_VIEW,
      ],
      permissionIds: [
        SystemPermissions.PLATFORM_TENANT_VIEW,
        SystemPermissions.PLATFORM_IMPERSONATION_START,
        SystemPermissions.PLATFORM_AUDIT_VIEW,
      ],
      campusIds: [],
    };
    prisma.memoryStore.users.set(platformSupportUser.id, platformSupportUser);

    // 4. Tenant A user (tenantId = 'tenant_a_100')
    tenantAUser = {
      id: 'usr_tenant_a',
      tenantId: 'tenant_a_100',
      email: 'owner@tenanta.com',
      passwordHash,
      firstName: 'TenantA',
      lastName: 'Owner',
      isActive: true,
      isPlatformAdmin: false,
      role: 'School Owner',
      roles: ['School Owner'],
      permissions: [SystemPermissions.SETTINGS_VIEW, SystemPermissions.STUDENTS_VIEW],
      permissionIds: [SystemPermissions.SETTINGS_VIEW, SystemPermissions.STUDENTS_VIEW],
      campusIds: ['campus_a_1'],
    };
    prisma.memoryStore.users.set(tenantAUser.id, tenantAUser);

    // 5. Tenant B user (tenantId = 'tenant_b_200')
    tenantBUser = {
      id: 'usr_tenant_b',
      tenantId: 'tenant_b_200',
      email: 'owner@tenantb.com',
      passwordHash,
      firstName: 'TenantB',
      lastName: 'Owner',
      isActive: true,
      isPlatformAdmin: false,
      role: 'School Owner',
      roles: ['School Owner'],
      permissions: [SystemPermissions.SETTINGS_VIEW],
      permissionIds: [SystemPermissions.SETTINGS_VIEW],
      campusIds: ['campus_b_1'],
    };
    prisma.memoryStore.users.set(tenantBUser.id, tenantBUser);

    // Register Tenants in memory store
    prisma.memoryStore.tenants.set('tenant_a_100', {
      id: 'tenant_a_100',
      slug: 'tenant-a',
      name: 'Tenant A Academy',
      status: 'ACTIVE',
      plan: 'PRO',
    });
    prisma.memoryStore.tenants.set('tenant_b_200', {
      id: 'tenant_b_200',
      slug: 'tenant-b',
      name: 'Tenant B International',
      status: 'ACTIVE',
      plan: 'STARTER',
    });
  });

  // Helper to create mock ExecutionContext
  const createMockContext = (user: any, tenantContext?: any, requiredPermissions?: string[], requiredRoles?: string[]) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          tenantContext,
          headers: {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  };

  // -------------------------------------------------------------
  // Test 1: SUPER_ADMIN logs in without tenantId
  // -------------------------------------------------------------
  it('Test 1: SUPER_ADMIN logs in without tenantId -> SUCCESS with tenantId = null and scope = PLATFORM', async () => {
    const result = await authService.platformLogin('superadmin@platform.io', passwordPlain);
    expect(result).toBeDefined();
    expect(result.accessToken).toBeDefined();
    expect(result.user.tenantId).toBeNull();
    expect(result.user.scope).toBe('PLATFORM');
    expect(result.user.role).toBe('SUPER_ADMIN');

    const decoded: any = jwtService.decode(result.accessToken);
    expect(decoded.tenantId).toBeNull();
    expect(decoded.scope).toBe('PLATFORM');
    expect(decoded.role).toBe('SUPER_ADMIN');
  });

  // -------------------------------------------------------------
  // Test 2: PLATFORM_ADMIN logs in without tenantId
  // -------------------------------------------------------------
  it('Test 2: PLATFORM_ADMIN logs in without tenantId -> SUCCESS with tenantId = null and scope = PLATFORM', async () => {
    const result = await authService.platformLogin('admin@platform.io', passwordPlain);
    expect(result).toBeDefined();
    expect(result.user.tenantId).toBeNull();
    expect(result.user.scope).toBe('PLATFORM');
    expect(result.user.role).toBe('PLATFORM_ADMIN');
  });

  // -------------------------------------------------------------
  // Test 3: PLATFORM_SUPPORT logs in without tenantId
  // -------------------------------------------------------------
  it('Test 3: PLATFORM_SUPPORT logs in without tenantId -> SUCCESS with tenantId = null and scope = PLATFORM', async () => {
    const result = await authService.platformLogin('support@platform.io', passwordPlain);
    expect(result).toBeDefined();
    expect(result.user.tenantId).toBeNull();
    expect(result.user.scope).toBe('PLATFORM');
    expect(result.user.role).toBe('PLATFORM_SUPPORT');
  });

  // -------------------------------------------------------------
  // Test 4: Tenant user logs in with its tenant context
  // -------------------------------------------------------------
  it('Test 4: Tenant user logs in with its tenant context -> SUCCESS with tenantId != null and scope = TENANT', async () => {
    const result = await authService.login('tenant_a_100', 'owner@tenanta.com', passwordPlain);
    expect(result).toBeDefined();
    expect(result.user.tenantId).toBe('tenant_a_100');
    expect(result.user.scope).toBe('TENANT');

    // Attempting to login to wrong tenant must fail
    await expect(authService.login('tenant_b_200', 'owner@tenanta.com', passwordPlain))
      .rejects.toThrow(UnauthorizedException);
  });

  // -------------------------------------------------------------
  // Test 5: SUPER_ADMIN accesses an authorized platform endpoint
  // -------------------------------------------------------------
  it('Test 5: SUPER_ADMIN accesses an authorized platform endpoint -> SUCCESS', () => {
    reflector.getAllAndOverride = ((key: string) => {
      if (key === 'permissions') return [SystemPermissions.PLATFORM_TENANT_SUSPEND];
      return undefined;
    }) as any;

    const ctx = createMockContext(superAdminUser);
    expect(permissionsGuard.canActivate(ctx)).toBe(true);
    expect(platformAdminGuard.canActivate(ctx)).toBe(true);
  });

  // -------------------------------------------------------------
  // Test 6: PLATFORM_ADMIN accesses a permission it has
  // -------------------------------------------------------------
  it('Test 6: PLATFORM_ADMIN accesses a permission it has -> SUCCESS', () => {
    reflector.getAllAndOverride = ((key: string) => {
      if (key === 'permissions') return [SystemPermissions.PLATFORM_TENANT_VIEW];
      return undefined;
    }) as any;

    const ctx = createMockContext(platformAdminUser);
    expect(permissionsGuard.canActivate(ctx)).toBe(true);
  });

  // -------------------------------------------------------------
  // Test 7: PLATFORM_ADMIN accesses a permission it does not have
  // -------------------------------------------------------------
  it('Test 7: PLATFORM_ADMIN accesses a permission it does not have -> FORBIDDEN', () => {
    reflector.getAllAndOverride = ((key: string) => {
      if (key === 'permissions') return [SystemPermissions.PLATFORM_TENANT_SUSPEND];
      return undefined;
    }) as any;

    const ctx = createMockContext(platformAdminUser);
    expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // -------------------------------------------------------------
  // Test 8: PLATFORM_SUPPORT accesses an unauthorized administrative operation
  // -------------------------------------------------------------
  it('Test 8: PLATFORM_SUPPORT accesses an unauthorized administrative operation -> FORBIDDEN', () => {
    reflector.getAllAndOverride = ((key: string) => {
      if (key === 'permissions') return [SystemPermissions.PLATFORM_USER_CREATE];
      return undefined;
    }) as any;

    const ctx = createMockContext(platformSupportUser);
    expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // -------------------------------------------------------------
  // Test 9: PLATFORM_ADMIN attempts to create/promote SUPER_ADMIN
  // -------------------------------------------------------------
  it('Test 9: PLATFORM_ADMIN attempts to create or promote to SUPER_ADMIN -> FORBIDDEN', async () => {
    // Attempting to create a SUPER_ADMIN account
    await expect(
      platformUserService.createPlatformUser(platformAdminUser, {
        email: 'rogue@platform.io',
        password: 'Password123!',
        firstName: 'Rogue',
        lastName: 'Admin',
        role: 'SUPER_ADMIN' as any,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Attempting to promote an existing user to SUPER_ADMIN
    await expect(
      platformUserService.updateRole(platformAdminUser, platformSupportUser.id, {
        role: 'SUPER_ADMIN' as any,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // -------------------------------------------------------------
  // Test 10: PLATFORM_SUPPORT attempts to modify its own permissions
  // -------------------------------------------------------------
  it('Test 10: PLATFORM_SUPPORT attempts to modify its own permissions -> FORBIDDEN', async () => {
    await expect(
      platformUserService.updatePermissions(platformSupportUser, platformSupportUser.id, {
        permissions: ['*'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // -------------------------------------------------------------
  // Test 11: Tenant A user attempts to access Tenant B data
  // -------------------------------------------------------------
  it('Test 11: Tenant A user attempts to access Tenant B data -> FORBIDDEN via TenantGuard', () => {
    const tenantBContext = { tenantId: 'tenant_b_200', slug: 'tenant-b', name: 'Tenant B' };
    const ctx = createMockContext(tenantAUser, tenantBContext);

    expect(() => tenantGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // -------------------------------------------------------------
  // Test 12: Client attempts to manipulate tenant headers to access another tenant
  // -------------------------------------------------------------
  it('Test 12: Client attempts to manipulate tenant context for unauthorized tenant -> FORBIDDEN', () => {
    // Tenant A user presenting Tenant B context
    const maliciousContext = { tenantId: 'tenant_b_200', slug: 'tenant-b' };
    const ctx = createMockContext(tenantAUser, maliciousContext);

    expect(() => tenantGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // -------------------------------------------------------------
  // Test 13: Client attempts to activate RLS bypass via request
  // -------------------------------------------------------------
  it('Test 13: Client without platform scope cannot access platform endpoints or bypass tenant checks', () => {
    reflector.getAllAndOverride = ((key: string) => {
      if (key === 'permissions') return [SystemPermissions.PLATFORM_TENANT_VIEW];
      return undefined;
    }) as any;

    const ctx = createMockContext(tenantAUser, { tenantId: 'tenant_a_100' });
    expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => platformAdminGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // -------------------------------------------------------------
  // Test 14: SUPER_ADMIN performs an authorized cross-tenant platform operation
  // -------------------------------------------------------------
  it('Test 14: SUPER_ADMIN performs an authorized cross-tenant platform operation -> SUCCESS and AUDITED', async () => {
    const updated = await platformAdminService.updateTenantStatus(
      'tenant_b_200',
      { status: 'SUSPENDED', reason: 'Audit verification test' },
      superAdminUser.id,
    );

    expect(updated.status).toBe('SUSPENDED');

    // Verify audit log
    const auditLogs = Array.from(prisma.memoryStore.auditLogs.values());
    const match = auditLogs.find((l) => l.resourceId === 'tenant_b_200' && (l.action === 'TENANT_STATUS_CHANGED' || l.action === 'TENANT_STATUS_UPDATED'));
    expect(match).toBeDefined();
    expect(match?.actorUserId).toBe(superAdminUser.id);
  });

  // -------------------------------------------------------------
  // Test 15: Impersonation is started
  // -------------------------------------------------------------
  it('Test 15: Impersonation is started -> SUCCESS with platform operator recorded and AUDITED', async () => {
    const sessionResult = await impersonationService.startImpersonation(
      superAdminUser,
      {
        targetTenantId: 'tenant_a_100',
        targetUserId: tenantAUser.id,
        reason: 'Investigating support ticket #1234',
        durationMinutes: 30,
      },
      { ipAddress: '127.0.0.1', userAgent: 'TestRunner' },
    );

    expect(sessionResult).toBeDefined();
    expect(sessionResult.token).toBeDefined();
    expect(sessionResult.session.superAdminUserId).toBe(superAdminUser.id);
    expect(sessionResult.session.tenantId).toBe('tenant_a_100');

    // Decode impersonation token
    const decoded: any = jwtService.decode(sessionResult.token);
    expect(decoded.isImpersonating).toBe(true);
    expect(decoded.impersonatorUserId).toBe(superAdminUser.id);
    expect(decoded.tenantId).toBe('tenant_a_100');

    // Verify audit log
    const auditLogs = Array.from(prisma.memoryStore.auditLogs.values());
    const impAudit = auditLogs.find((l) => l.action === 'IMPERSONATION_STARTED');
    expect(impAudit).toBeDefined();
    expect(impAudit?.impersonatedBy).toBe(superAdminUser.id);
    expect(impAudit?.tenantId).toBe('tenant_a_100');
  });
});
