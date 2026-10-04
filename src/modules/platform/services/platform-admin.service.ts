import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { SubscriptionsService, SAAS_PLANS } from '../../subscriptions/subscriptions.service.js';
import {
  PlatformTenantFilterDto,
  UpdateTenantStatusDto,
  UpdateTenantPlanDto,
  TenantDangerActionDto,
  DeleteTenantDangerDto,
} from '../dto/platform-tenant.dto.js';

@Injectable()
export class PlatformAdminService {
  private readonly logger = new Logger(PlatformAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async getGlobalStats() {
    const totalTenants = await this.prisma.tenant.count();
    const activeTenants = await this.prisma.tenant.count({ where: { status: 'ACTIVE' } });
    const trialTenants = await this.prisma.tenant.count({ where: { status: 'TRIAL' } });
    const suspendedTenants = await this.prisma.tenant.count({ where: { status: 'SUSPENDED' } });
    const totalCampuses = await this.prisma.campus.count();
    const totalStudents = await this.prisma.student.count();
    const totalUsers = await this.prisma.user.count();

    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
    });

    let mrr = 0;
    for (const sub of activeSubscriptions) {
      const planKey = ((sub as any).planTier || (sub as any).tier || 'GROWTH').toLowerCase();
      const plan = (SAAS_PLANS as any)[planKey] || SAAS_PLANS.growth;
      mrr += plan.monthlyPrice || 0;
    }

    return {
      tenants: {
        total: totalTenants,
        active: activeTenants,
        trial: trialTenants,
        suspended: suspendedTenants,
      },
      infrastructure: {
        totalCampuses,
        totalStudents,
        totalUsers,
      },
      financials: {
        estimatedMrr: mrr || activeTenants * 50000,
        estimatedArr: (mrr || activeTenants * 50000) * 12,
      },
    };
  }

  async listTenants(filter?: PlatformTenantFilterDto) {
    const where: any = {};
    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.plan) {
      where.plan = { equals: filter.plan, mode: 'insensitive' };
    }
    if (filter?.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { slug: { contains: filter.search, mode: 'insensitive' } },
        { id: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const dbTenants = await this.prisma.tenant.findMany({
      where,
      include: {
        domains: true,
        campuses: true,
        _count: {
          select: {
            students: true,
            campuses: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return dbTenants.map((t) => ({
      ...t,
      studentCount: t._count?.students ?? 0,
      campusCount: t._count?.campuses ?? t.campuses?.length ?? 0,
      subscriptionTier: t.plan || 'starter',
      subscriptionStatus: t.status || 'TRIAL',
    }));
  }

  async getTenantDetail(tenantId: string) {
    const dbTenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        domains: true,
        campuses: true,
        _count: {
          select: {
            students: true,
            users: true,
          },
        },
      },
    });

    if (!dbTenant) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const sub = await this.subscriptionsService.getSubscription(tenantId);
    const recentAuditLogs = await this.auditService.list(tenantId, 10);

    return {
      tenant: dbTenant,
      campuses: dbTenant.campuses || [],
      studentsCount: dbTenant._count?.students ?? 0,
      usersCount: dbTenant._count?.users ?? 0,
      domains: dbTenant.domains || [],
      subscription: sub || {
        planId: dbTenant.plan,
        tier: dbTenant.plan,
        status: dbTenant.status,
      },
      recentAuditLogs,
    };
  }

  async updateTenantStatus(tenantId: string, dto: UpdateTenantStatusDto, superAdminId: string) {
    const existing = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const previousStatus = existing.status;

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: dto.status as any },
    });

    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: {
        status: dto.status === 'ACTIVE' ? 'ACTIVE' : (dto.status === 'SUSPENDED' ? 'SUSPENDED' : undefined),
      },
    });

    await this.auditService.log({
      tenantId,
      actorUserId: superAdminId,
      action: 'TENANT_STATUS_CHANGED',
      resourceType: 'TENANT',
      resourceId: tenantId,
      beforeData: { status: previousStatus },
      afterData: { status: dto.status, reason: dto.reason || 'Platform admin status change' },
    });

    return {
      tenantId,
      status: dto.status,
      message: `Tenant status successfully updated from ${previousStatus} to ${dto.status}`,
    };
  }

  async updateTenantPlan(tenantId: string, dto: UpdateTenantPlanDto, superAdminId: string) {
    const plan = (SAAS_PLANS as any)[dto.plan.toLowerCase()] || SAAS_PLANS.growth;

    const existing = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const previousPlan = existing.plan;

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { plan: plan.tier },
    });

    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: {
        tier: plan.tier as any,
        maxStudents: plan.maxStudents,
        maxCampuses: plan.maxCampuses,
        maxStaff: plan.maxStaff,
        storageLimitMb: plan.storageLimitMb,
        messagingQuota: plan.messagingQuota,
      },
    });

    await this.auditService.log({
      tenantId,
      actorUserId: superAdminId,
      action: 'TENANT_PLAN_MODIFIED',
      resourceType: 'TENANT',
      resourceId: tenantId,
      beforeData: { plan: previousPlan },
      afterData: { plan: plan.tier, notes: dto.notes },
    });

    return {
      tenantId,
      plan: updated.plan,
      features: (updated as any).features || {},
      message: `Tenant plan successfully updated to ${plan.name}`,
    };
  }

  async deactivateTenant(tenantId: string, reason?: string, adminUser?: any) {
    const now = new Date();
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant with ID '${tenantId}' not found.`);

    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: { status: 'CANCELLED', autoRenew: false, updatedAt: now },
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'SUSPENDED', updatedAt: now },
    });

    await this.auditService.log({
      tenantId,
      actorUserId: adminUser?.id || adminUser?.userId || 'superadmin_system',
      action: 'TENANT_DEACTIVATED',
      resourceType: 'TENANT',
      resourceId: tenantId,
      beforeData: { status: tenant.status },
      afterData: {
        status: 'SUSPENDED',
        subscriptionStatus: 'CANCELLED',
        reason: reason || 'Platform Super Admin Deactivation',
        deactivatedBy: adminUser?.email || 'Platform Super Admin',
      },
    });

    return {
      success: true,
      status: 'DEACTIVATED',
      message: `School tenant '${tenant.name}' subscription has been deactivated.`,
    };
  }

  async suspendTenant(tenantId: string, reason: string, adminUser?: any) {
    const now = new Date();
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A reason for school suspension is strictly required.');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant with ID '${tenantId}' not found.`);

    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: { status: 'SUSPENDED', updatedAt: now },
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'SUSPENDED', updatedAt: now },
    });

    await this.auditService.log({
      tenantId,
      actorUserId: adminUser?.id || adminUser?.userId || 'superadmin_system',
      action: 'TENANT_SUSPENDED',
      resourceType: 'TENANT',
      resourceId: tenantId,
      beforeData: { status: tenant.status },
      afterData: {
        status: 'SUSPENDED',
        reason,
        suspendedBy: adminUser?.email || 'Platform Super Admin',
      },
    });

    return {
      success: true,
      status: 'SUSPENDED',
      message: `School tenant '${tenant.name}' has been suspended.`,
    };
  }

  async archiveTenant(tenantId: string, reason?: string, adminUser?: any) {
    const now = new Date();
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant with ID '${tenantId}' not found.`);

    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: { status: 'CANCELLED', autoRenew: false, updatedAt: now },
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ARCHIVED', updatedAt: now },
    });

    await this.auditService.log({
      tenantId,
      actorUserId: adminUser?.id || adminUser?.userId || 'superadmin_system',
      action: 'TENANT_ARCHIVED',
      resourceType: 'TENANT',
      resourceId: tenantId,
      beforeData: { status: tenant.status },
      afterData: {
        status: 'ARCHIVED',
        reason: reason || 'Platform Super Admin Archive to cold storage',
        archivedBy: adminUser?.email || 'Platform Super Admin',
      },
    });

    return {
      success: true,
      status: 'ARCHIVED',
      message: `School tenant '${tenant.name}' has been archived to cold storage.`,
    };
  }

  async reactivateTenant(tenantId: string, adminUser?: any) {
    const now = new Date();
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant with ID '${tenantId}' not found.`);

    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: { status: 'ACTIVE', updatedAt: now },
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE', updatedAt: now },
    });

    await this.auditService.log({
      tenantId,
      actorUserId: adminUser?.id || adminUser?.userId || 'superadmin_system',
      action: 'TENANT_REACTIVATED',
      resourceType: 'TENANT',
      resourceId: tenantId,
      beforeData: { status: tenant.status },
      afterData: {
        status: 'ACTIVE',
        reactivatedBy: adminUser?.email || 'Platform Super Admin',
      },
    });

    return {
      success: true,
      status: 'ACTIVE',
      message: `School tenant '${tenant.name}' has been restored to ACTIVE status.`,
    };
  }

  async deleteTenantDanger(tenantId: string, dto: DeleteTenantDangerDto, adminUser: any) {
    const userRole = adminUser?.role || adminUser?.platformRole;
    if (userRole !== 'SUPER_ADMIN' && !adminUser?.isPlatformAdmin) {
      throw new ForbiddenException('Only Platform Super Administrators can execute permanent tenant deletion.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`School tenant with ID '${tenantId}' not found.`);
    }

    if (
      !dto.confirmationSchoolName ||
      dto.confirmationSchoolName.trim().toLowerCase() !== tenant.name.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        `School name confirmation mismatch. You typed '${dto.confirmationSchoolName}', but the target school is '${tenant.name}'.`,
      );
    }

    if (dto.confirmationCheckbox !== true) {
      throw new BadRequestException(
        'Explicit confirmation checkbox acknowledging irreversible data destruction must be checked.',
      );
    }

    if (!dto.superAdminPassword) {
      throw new BadRequestException('Super Admin password is required to authorize permanent deletion.');
    }

    const adminEmail = adminUser.email || 'superadmin@platform.io';
    const adminRecord = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: adminUser.id || adminUser.userId || '' },
          { email: adminEmail },
        ],
      },
    });

    if (!adminRecord || !adminRecord.passwordHash) {
      throw new UnauthorizedException('Super Admin credentials could not be verified.');
    }

    const isPasswordValid =
      Boolean(adminRecord.passwordHash) &&
      (adminRecord.passwordHash.startsWith('$2a$') || adminRecord.passwordHash.startsWith('$2b$')) &&
      (await bcrypt.compare(dto.superAdminPassword, adminRecord.passwordHash));

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid Super Admin password. Deletion authorization rejected.');
    }

    if (tenant.id === 'tenant_platform_system' || tenant.slug === 'platform-master') {
      throw new BadRequestException('Core platform tenant cannot be deleted.');
    }

    const deletedTenantName = tenant.name;
    const deletedTenantSlug = tenant.slug;

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          id: `aud_del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId: tenantId,
          action: 'TENANT_PERMANENTLY_DELETED',
          resourceType: 'TENANT',
          resourceId: tenantId,
          actorUserId: adminRecord.id,
          beforeData: {
            tenantId,
            schoolName: deletedTenantName,
            slug: deletedTenantSlug,
            status: tenant.status,
            plan: tenant.plan,
          },
          afterData: {
            reason: dto.reason || 'Super Admin Danger Zone Permanent Deletion',
            deletedBy: adminRecord.email,
            deletedAt: new Date().toISOString(),
          },
        },
      });

      await tx.subscriptionFeatureOverride.deleteMany({ where: { tenantId } });
      await tx.subscriptionPayment.deleteMany({ where: { tenantId } });
      await tx.billingInvoice.deleteMany({ where: { tenantId } });
      await tx.subscription.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.tenantDomain.deleteMany({ where: { tenantId } });

      await tx.tenant.delete({
        where: { id: tenantId },
      });
    });

    return {
      success: true,
      tenantId,
      schoolName: deletedTenantName,
      message: `School tenant '${deletedTenantName}' (${tenantId}) and all associated platform records have been permanently deleted.`,
    };
  }
}
