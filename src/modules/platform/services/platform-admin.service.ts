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
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const previousStatus = tenant.status;
    tenant.status = dto.status;
    tenant.updatedAt = new Date();
    this.prisma.memoryStore.tenants.set(tenantId, tenant);

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
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const plan = SAAS_PLANS[dto.plan.toLowerCase()] || SAAS_PLANS.growth;
    const previousPlan = tenant.plan;

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
