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

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: targetTenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Target tenant with ID '${targetTenantId}' not found`);
    }

    let targetUser: any = null;
    if (dto.targetUserId) {
      targetUser = await this.prisma.user.findFirst({
        where: { id: dto.targetUserId, tenantId: targetTenantId },
      });
      if (!targetUser) {
        throw new NotFoundException(
          `Target user '${dto.targetUserId}' not found in tenant '${targetTenantId}'`,
        );
      }
    } else {
      targetUser = await this.prisma.user.findFirst({
        where: { tenantId: targetTenantId, isActive: true },
      });
      if (!targetUser) {
        throw new NotFoundException(`No active user found in tenant '${targetTenantId}' to impersonate.`);
      }
    }

    const durationMinutes = Math.min(120, Math.max(5, dto.durationMinutes || 30));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

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
      firstName: targetUser.firstName || 'School',
      lastName: targetUser.lastName || 'Administrator',
    };

    const token = this.jwtService.sign(tokenPayload, {
      expiresIn: `${durationMinutes}m`,
    });

    const session = await this.prisma.impersonationSession.create({
      data: {
        tenantId: targetTenantId,
        superAdminUserId: superAdminUser?.id || 'superadmin_system',
        targetUserId: targetUser.id,
        reason: dto.reason,
        token,
        startedAt: now,
        expiresAt,
        isActive: true,
        ipAddress: metadata?.ipAddress || null,
        userAgent: metadata?.userAgent || null,
      },
    });

    await this.auditService.log({
      tenantId: targetTenantId,
      actorUserId: targetUser.id,
      impersonatedBy: superAdminUser?.id || 'superadmin_system',
      impersonationSessionId: session.id,
      isImpersonated: true,
      action: 'IMPERSONATION_STARTED',
      resourceType: 'IMPERSONATION_SESSION',
      resourceId: session.id,
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
      sessionId: session.id,
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
    const session = await this.prisma.impersonationSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return { valid: false, reason: 'Session not found' };

    const now = new Date();
    if (!session.isActive || session.revokedAt) {
      return { valid: false, reason: 'Session has been terminated or revoked' };
    }
    if (session.expiresAt <= now) {
      await this.prisma.impersonationSession.update({
        where: { id: sessionId },
        data: { isActive: false },
      });
      return { valid: false, reason: 'Session has expired' };
    }

    return { valid: true, session };
  }

  async terminateImpersonation(
    sessionId: string,
    superAdminId: string,
    dto?: TerminateImpersonationDto,
  ) {
    const session = await this.prisma.impersonationSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Impersonation session '${sessionId}' not found`);
    }

    if (!session.isActive) {
      return { sessionId, message: 'Session is already terminated', session };
    }

    const revokedAt = new Date();
    const revocationReason = dto?.reason || 'Terminated by superadmin';

    const updated = await this.prisma.impersonationSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        revokedAt,
        revocationReason,
      },
    });

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
        terminatedAt: revokedAt,
        reason: revocationReason,
      },
    });

    return {
      sessionId,
      status: 'TERMINATED',
      revokedAt,
      message: 'Impersonation session terminated successfully',
    };
  }

  async listSessions(filter?: ImpersonationFilterDto) {
    const where: any = {};
    if (filter?.tenantId) {
      where.tenantId = filter.tenantId;
    }
    if (filter?.superAdminUserId) {
      where.superAdminUserId = filter.superAdminUserId;
    }
    if (filter?.isActive !== undefined) {
      where.isActive = filter.isActive === true || filter.isActive === 'true';
    }

    return this.prisma.impersonationSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
