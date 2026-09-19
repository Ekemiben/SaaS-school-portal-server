import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { SubscriptionsService, SAAS_PLANS } from '../../subscriptions/subscriptions.service.js';
import {
  PlatformTenantFilterDto,
  UpdateTenantStatusDto,
  UpdateTenantPlanDto,
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
    if (this.prisma.isDbConnected) {
      try {
        const totalTenants = await this.prisma.tenant.count();
        const activeTenants = await this.prisma.tenant.count({ where: { status: 'ACTIVE' } });
        const trialTenants = await this.prisma.tenant.count({ where: { status: 'TRIAL' } });
        const suspendedTenants = await this.prisma.tenant.count({ where: { status: 'SUSPENDED' } });
        const totalCampuses = await this.prisma.campus.count();
        const totalStudents = await this.prisma.student.count();
        const totalUsers = await this.prisma.user.count();

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
            estimatedMrr: activeTenants * 50000,
            estimatedArr: activeTenants * 50000 * 12,
          },
        };
      } catch (err: any) {
        this.logger.warn(`Could not load stats from DB, falling back to memory: ${err.message}`);
      }
    }

    const tenants = Array.from(this.prisma.memoryStore.tenants.values());
    const campuses = Array.from(this.prisma.memoryStore.campuses.values());
    const students = Array.from(this.prisma.memoryStore.students.values());
    const users = Array.from(this.prisma.memoryStore.users.values());
    const subscriptions = Array.from(this.prisma.memoryStore.subscriptions.values());

    const activeTenants = tenants.filter((t: any) => t.status === 'ACTIVE').length;
    const trialTenants = tenants.filter((t: any) => t.status === 'TRIAL' || t.plan === 'free_trial').length;
    const suspendedTenants = tenants.filter((t: any) => t.status === 'SUSPENDED').length;

    let mrr = 0;
    for (const sub of subscriptions) {
      if (sub.status === 'ACTIVE') {
        const plan = SAAS_PLANS[sub.tier || sub.planId] || SAAS_PLANS.growth;
        mrr += plan.monthlyPrice;
      }
    }

    return {
      tenants: {
        total: tenants.length,
        active: activeTenants,
        trial: trialTenants,
        suspended: suspendedTenants,
      },
      infrastructure: {
        totalCampuses: campuses.length,
        totalStudents: students.length,
        totalUsers: users.length,
      },
      financials: {
        estimatedMrr: mrr,
        estimatedArr: mrr * 12,
      },
    };
  }

  async listTenants(filter?: PlatformTenantFilterDto) {
    if (this.prisma.isDbConnected) {
      try {
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

        if (dbTenants.length > 0) {
          return dbTenants.map((t) => ({
            ...t,
            studentCount: t._count?.students ?? 0,
            campusCount: t._count?.campuses ?? t.campuses?.length ?? 0,
            subscriptionTier: t.plan || 'starter',
            subscriptionStatus: t.status || 'TRIAL',
          }));
        }
      } catch (err: any) {
        this.logger.warn(`Could not load tenants from DB, falling back to memory: ${err.message}`);
      }
    }

    let list = Array.from(this.prisma.memoryStore.tenants.values());

    if (filter?.status) {
      list = list.filter((t: any) => t.status === filter.status);
    }
    if (filter?.plan) {
      list = list.filter((t: any) => (t.plan || '').toLowerCase() === filter.plan!.toLowerCase());
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (t: any) =>
          t.name.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          (t.id && t.id.toLowerCase().includes(q)),
      );
    }

    return list.map((tenant: any) => {
      const studentCount = Array.from(this.prisma.memoryStore.students.values()).filter(
        (s: any) => s.tenantId === tenant.id,
      ).length;
      const campusCount = Array.from(this.prisma.memoryStore.campuses.values()).filter(
        (c: any) => c.tenantId === tenant.id,
      ).length;
      const sub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
        (s: any) => s.tenantId === tenant.id,
      );

      return {
        ...tenant,
        studentCount,
        campusCount,
        subscriptionTier: sub?.tier || tenant.plan || 'free_trial',
        subscriptionStatus: sub?.status || 'ACTIVE',
      };
    });
  }

  async getTenantDetail(tenantId: string) {
    if (this.prisma.isDbConnected) {
      try {
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
        if (dbTenant) {
          return {
            tenant: dbTenant,
            campuses: dbTenant.campuses || [],
            studentsCount: dbTenant._count?.students ?? 0,
            usersCount: dbTenant._count?.users ?? 0,
            domains: dbTenant.domains || [],
            subscription: {
              planId: dbTenant.plan,
              tier: dbTenant.plan,
              status: dbTenant.status,
            },
            recentAuditLogs: [],
          };
        }
      } catch (err: any) {
        this.logger.warn(`Could not load tenant detail from DB: ${err.message}`);
      }
    }

    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const campuses = Array.from(this.prisma.memoryStore.campuses.values()).filter(
      (c: any) => c.tenantId === tenantId,
    );
    const studentsCount = Array.from(this.prisma.memoryStore.students.values()).filter(
      (s: any) => s.tenantId === tenantId,
    ).length;
    const usersCount = Array.from(this.prisma.memoryStore.users.values()).filter(
      (u: any) => u.tenantId === tenantId,
    ).length;
    const domains = Array.from(this.prisma.memoryStore.domains.values()).filter(
      (d: any) => d.tenantId === tenantId,
    );
    const sub = await this.subscriptionsService.getSubscription(tenantId);
    const recentAuditLogs = await this.auditService.list(tenantId, 10);

    return {
      tenant,
      campuses,
      studentsCount,
      usersCount,
      domains,
      subscription: sub,
      recentAuditLogs,
    };
  }

  async updateTenantStatus(tenantId: string, dto: UpdateTenantStatusDto, superAdminId: string) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { status: dto.status as any },
        });
      } catch (err: any) {
        this.logger.warn(`Could not update tenant status in DB: ${err.message}`);
      }
    }

    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant && !this.prisma.isDbConnected) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const previousStatus = tenant ? tenant.status : 'TRIAL';
    if (tenant) {
      tenant.status = dto.status;
      tenant.updatedAt = new Date();
      this.prisma.memoryStore.tenants.set(tenantId, tenant);
    }

    // Update subscription status in sync
    const sub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
      (s: any) => s.tenantId === tenantId,
    );
    if (sub) {
      sub.status = dto.status === 'ACTIVE' ? 'ACTIVE' : (dto.status === 'SUSPENDED' ? 'SUSPENDED' : sub.status);
      sub.updatedAt = new Date();
      this.prisma.memoryStore.subscriptions.set(sub.id, sub);
    }

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
      status: tenant.status,
      message: `Tenant status successfully updated from ${previousStatus} to ${dto.status}`,
    };
  }

  async updateTenantPlan(tenantId: string, dto: UpdateTenantPlanDto, superAdminId: string) {
    const plan = SAAS_PLANS[dto.plan.toLowerCase()] || SAAS_PLANS.growth;

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { plan: plan.tier },
        });
      } catch (err: any) {
        this.logger.warn(`Could not update tenant plan in DB: ${err.message}`);
      }
    }

    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant && !this.prisma.isDbConnected) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const previousPlan = tenant ? tenant.plan : 'starter';
    if (tenant) {
      tenant.plan = plan.tier;
      if (dto.features) {
        tenant.features = { ...tenant.features, ...dto.features };
      } else {
        tenant.features = plan.features.reduce((acc: any, f: string) => {
          acc[f] = true;
          return acc;
        }, {});
      }
      tenant.updatedAt = new Date();
      this.prisma.memoryStore.tenants.set(tenantId, tenant);
    }

    // Sync subscription
    const sub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
      (s: any) => s.tenantId === tenantId,
    );
    if (sub) {
      sub.tier = plan.tier;
      sub.maxStudents = plan.maxStudents;
      sub.maxCampuses = plan.maxCampuses;
      sub.maxStaff = plan.maxStaff;
      sub.storageLimitMb = plan.storageLimitMb;
      sub.messagingQuota = plan.messagingQuota;
      sub.updatedAt = new Date();
      this.prisma.memoryStore.subscriptions.set(sub.id, sub);
    }

    await this.auditService.log({
      tenantId,
      actorUserId: superAdminId,
      action: 'TENANT_PLAN_MODIFIED',
      resourceType: 'TENANT',
      resourceId: tenantId,
      beforeData: { plan: previousPlan },
      afterData: { plan: plan.tier, features: tenant.features, notes: dto.notes },
    });

    return {
      tenantId,
      plan: tenant.plan,
      features: tenant.features,
      message: `Tenant plan successfully updated to ${plan.name}`,
    };
  }
}
