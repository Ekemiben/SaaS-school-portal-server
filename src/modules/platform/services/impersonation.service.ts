import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  StartImpersonationDto,
  TerminateImpersonationDto,
  ImpersonationFilterDto,
} from '../dto/impersonation.dto.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async startImpersonation(
    superAdminUser: any,
    dto: StartImpersonationDto,
    metadata?: { ipAddress?: string; userAgent?: string },
  ) {
    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('A mandatory justification/reason (min 5 chars) is required for support impersonation.');
    }

    const targetTenantId = dto.targetTenantId || dto.tenantId;
    if (!targetTenantId) {
      throw new BadRequestException('Target tenant ID is required to start impersonation.');
    }

    let tenant: any = null;
    if (this.prisma.isDbConnected) {
      try {
        tenant = await this.prisma.tenant.findUnique({
          where: { id: targetTenantId },
        });
      } catch {
        tenant = null;
      }
    }

    if (!tenant) {
      tenant = this.prisma.memoryStore.tenants.get(targetTenantId);
    }

    if (!tenant) {
      throw new NotFoundException(`Target tenant with ID '${targetTenantId}' not found`);
    }

    // Resolve target user
    let targetUser: any = null;
    if (dto.targetUserId) {
      if (this.prisma.isDbConnected) {
        try {
          targetUser = await this.prisma.user.findUnique({
            where: { id: dto.targetUserId },
          });
        } catch {
          targetUser = null;
        }
      }
      if (!targetUser) {
        targetUser = this.prisma.memoryStore.users.get(dto.targetUserId);
      }
      if (!targetUser || targetUser.tenantId !== targetTenantId) {
        throw new NotFoundException(
          `Target user '${dto.targetUserId}' not found in tenant '${targetTenantId}'`,
        );
      }
    } else {
      // Find an active admin or owner in the tenant
      if (this.prisma.isDbConnected) {
        try {
          targetUser = await this.prisma.user.findFirst({
            where: { tenantId: targetTenantId, isActive: true },
          });
        } catch {
          targetUser = null;
        }
      }
      if (!targetUser) {
        targetUser = Array.from(this.prisma.memoryStore.users.values()).find(
          (u: any) => u.tenantId === targetTenantId && u.isActive,
        );
      }
      if (!targetUser) {
        targetUser = {
          id: `usr_owner_${targetTenantId.replace(/-/g, '').substring(0, 16)}`,
          tenantId: targetTenantId,
          email: `admin@${tenant.slug || 'school'}.portal.io`,
          firstName: tenant.name,
          lastName: 'Administrator',
          isActive: true,
          role: 'School Owner',
          roles: ['School Owner', 'Admin'],
        };
        this.prisma.memoryStore.users.set(targetUser.id, targetUser);
      }
    }

    // Load full tenant-level permissions
    let tenantPermissions: string[] = [];
    if (this.prisma.isDbConnected) {
      try {
        const perms = await this.prisma.permission.findMany({
          where: {
            NOT: { module: 'PLATFORM' },
          },
        });
        tenantPermissions = perms.map((p) => p.name);
      } catch {
        tenantPermissions = [];
      }
    }
    if (tenantPermissions.length === 0) {
      tenantPermissions = Object.values(SystemPermissions).filter(
        (p) => !p.startsWith('platform.'),
      );
    }

    const durationMinutes = Math.min(120, Math.max(5, dto.durationMinutes || 30));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    const sessionId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Generate time-bound impersonation JWT token with full school owner authority
    const tokenPayload = {
      sub: targetUser.id,
      id: targetUser.id,
      tenantId: targetTenantId,
      email: targetUser.email,
      role: 'School Owner',
      roles: ['SCHOOL_OWNER', 'School Owner', 'Admin'],
      permissions: ['*'],
      scope: 'TENANT',
      isImpersonating: true,
      impersonatorUserId: superAdminUser?.id || 'superadmin_system',
      impersonatorEmail: superAdminUser?.email || 'admin@platform.io',
      impersonationSessionId: sessionId,
      firstName: targetUser.firstName || 'School',
      lastName: targetUser.lastName || 'Administrator',
    };

    const token = this.jwtService.sign(tokenPayload, {
      secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_key_change_in_production_123',
      expiresIn: `${durationMinutes}m`,
    });

    const session = {
      id: sessionId,
      tenantId: targetTenantId,
      superAdminUserId: superAdminUser?.id || 'superadmin_system',
      targetUserId: targetUser.id,
      reason: dto.reason,
      token,
      startedAt: now,
      expiresAt,
      revokedAt: null,
      revocationReason: null,
      isActive: true,
      ipAddress: metadata?.ipAddress || null,
      userAgent: metadata?.userAgent || null,
      createdAt: now,
    };

    this.prisma.memoryStore.impersonationSessions.set(sessionId, session);

    // Write audit log for starting impersonation
    await this.auditService.log({
      tenantId: targetTenantId,
      actorUserId: targetUser.id,
      impersonatedBy: superAdminUser?.id || 'superadmin_system',
      impersonationSessionId: sessionId,
      isImpersonated: true,
      action: 'IMPERSONATION_STARTED',
      resourceType: 'IMPERSONATION_SESSION',
      resourceId: sessionId,
      afterData: {
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        durationMinutes,
        expiresAt,
        reason: dto.reason,
      },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    this.logger.warn(
      `[IMPERSONATION] Superadmin ${superAdminUser?.email || superAdminUser?.id} initiated impersonation into ${tenant.name} (${targetTenantId}) as user ${targetUser.email}. Reason: ${dto.reason}`,
    );

    return {
      sessionId,
      token,
      expiresAt,
      durationMinutes,
      targetTenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        role: 'School Owner',
      },
      impersonator: {
        id: superAdminUser?.id || 'superadmin_system',
        email: superAdminUser?.email || 'admin@platform.io',
      },
      session,
    };
  }

  async validateSession(sessionId: string) {
    const session = this.prisma.memoryStore.impersonationSessions.get(sessionId);
    if (!session) return { valid: false, reason: 'Session not found' };

    const now = new Date();
    if (!session.isActive || session.revokedAt) {
      return { valid: false, reason: 'Session has been terminated or revoked' };
    }
    if (new Date(session.expiresAt) <= now) {
      session.isActive = false;
      this.prisma.memoryStore.impersonationSessions.set(sessionId, session);
      return { valid: false, reason: 'Session has expired' };
    }

    return { valid: true, session };
  }

  async terminateImpersonation(
    sessionId: string,
    superAdminId: string,
    dto?: TerminateImpersonationDto,
  ) {
    const session = this.prisma.memoryStore.impersonationSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Impersonation session '${sessionId}' not found`);
    }

    if (!session.isActive) {
      return { sessionId, message: 'Session is already terminated', session };
    }

    session.isActive = false;
    session.revokedAt = new Date();
    session.revocationReason = dto?.reason || 'Terminated by superadmin';
    this.prisma.memoryStore.impersonationSessions.set(sessionId, session);

    // Log audit event
    await this.auditService.log({
      tenantId: session.tenantId,
      actorUserId: session.targetUserId,
      impersonatedBy: superAdminId,
      impersonationSessionId: sessionId,
      isImpersonated: true,
      action: 'IMPERSONATION_TERMINATED',
      resourceType: 'IMPERSONATION_SESSION',
      resourceId: sessionId,
      afterData: {
        terminatedAt: session.revokedAt,
        reason: session.revocationReason,
      },
    });

    return {
      sessionId,
      status: 'TERMINATED',
      revokedAt: session.revokedAt,
      message: 'Impersonation session terminated successfully',
    };
  }

  async listSessions(filter?: ImpersonationFilterDto) {
    let list = Array.from(this.prisma.memoryStore.impersonationSessions.values());

    if (filter?.tenantId) {
      list = list.filter((s: any) => s.tenantId === filter.tenantId);
    }
    if (filter?.superAdminUserId) {
      list = list.filter((s: any) => s.superAdminUserId === filter.superAdminUserId);
    }
    if (filter?.isActive !== undefined) {
      const active = filter.isActive === true || filter.isActive === 'true';
      list = list.filter((s: any) => s.isActive === active);
    }

    return list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
