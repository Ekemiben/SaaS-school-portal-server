import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { QuotaOverrideDto } from './dto/quota-override.dto.js';

export interface PlanTierDefinition {
  tier: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  maxStudents: number;
  maxCampuses: number;
  maxStaff: number;
  storageLimitMb: number;
  messagingQuota: number;
  features: string[];
  description: string;
}

export const SAAS_PLANS: Record<string, PlanTierDefinition> = {
  free_trial: {
    tier: 'free_trial',
    name: 'Free Trial (30 Days)',
    monthlyPrice: 0,
    annualPrice: 0,
    maxStudents: 50,
    maxCampuses: 1,
    maxStaff: 10,
    storageLimitMb: 2048, // 2 GB
    messagingQuota: 100,
    features: ['academics', 'attendance', 'reports', 'homework'],
    description: '30-day evaluation trial with core academic and attendance modules.',
  },
  starter: {
    tier: 'starter',
    name: 'Starter Plan',
    monthlyPrice: 99,
    annualPrice: 990,
    maxStudents: 300,
    maxCampuses: 1,
    maxStaff: 30,
    storageLimitMb: 10240, // 10 GB
    messagingQuota: 1000,
    features: [
      'academics',
      'attendance',
      'examinations',
      'results',
      'homework',
      'reports',
      'notifications',
    ],
    description: 'Ideal for single-campus primary and secondary schools.',
  },
  growth: {
    tier: 'growth',
    name: 'Growth Plan',
    monthlyPrice: 249,
    annualPrice: 2490,
    maxStudents: 1500,
    maxCampuses: 3,
    maxStaff: 100,
    storageLimitMb: 51200, // 50 GB
    messagingQuota: 5000,
    features: [
      'academics',
      'attendance',
      'examinations',
      'results',
      'homework',
      'fees',
      'onlinePayments',
      'payroll',
      'expenses',
      'transport',
      'communications',
      'notifications',
      'medical',
      'admissions',
      'discipline',
      'hostel',
      'library',
      'inventory',
      'reports',
    ],
    description: 'Comprehensive multi-campus suite for scaling educational institutions.',
  },
  pro: {
    tier: 'growth',
    name: 'Pro Plan',
    monthlyPrice: 249,
    annualPrice: 2490,
    maxStudents: 1500,
    maxCampuses: 3,
    maxStaff: 100,
    storageLimitMb: 51200,
    messagingQuota: 5000,
    features: [
      'academics',
      'attendance',
      'examinations',
      'results',
      'homework',
      'fees',
      'onlinePayments',
      'payroll',
      'expenses',
      'transport',
      'communications',
      'notifications',
      'medical',
      'admissions',
      'discipline',
      'hostel',
      'library',
      'inventory',
      'reports',
    ],
    description: 'Full multi-campus suite.',
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise School System',
    monthlyPrice: 599,
    annualPrice: 5990,
    maxStudents: 10000,
    maxCampuses: 10,
    maxStaff: 500,
    storageLimitMb: 256000, // 250 GB
    messagingQuota: 25000,
    features: [
      'academics',
      'attendance',
      'examinations',
      'results',
      'homework',
      'fees',
      'onlinePayments',
      'payroll',
      'expenses',
      'transport',
      'communications',
      'notifications',
      'medical',
      'admissions',
      'discipline',
      'hostel',
      'library',
      'inventory',
      'reports',
      'audit',
      'customDomain',
      'prioritySupport',
      'dedicatedSla',
    ],
    description: 'For large school networks, state boards, and international school groups.',
  },
};

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  getAvailablePlans(): PlanTierDefinition[] {
    return [
      SAAS_PLANS.free_trial,
      SAAS_PLANS.starter,
      SAAS_PLANS.growth,
      SAAS_PLANS.enterprise,
    ];
  }

  getPlanDetails(tier: string): PlanTierDefinition {
    const key = (tier || 'growth').toLowerCase();
    return SAAS_PLANS[key] || SAAS_PLANS.growth;
  }

  async getSubscription(tenantId: string) {
    let sub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
      (s) => s.tenantId === tenantId,
    );

    if (!sub) {
      const plan = SAAS_PLANS.growth;
      sub = {
        id: `sub_${tenantId}`,
        tenantId,
        planId: plan.tier,
        tier: plan.tier,
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        trialEndsAt: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        maxStudents: plan.maxStudents,
        maxCampuses: plan.maxCampuses,
        maxStaff: plan.maxStaff,
        storageLimitMb: plan.storageLimitMb,
        messagingQuota: plan.messagingQuota,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.prisma.memoryStore.subscriptions.set(sub.id, sub);
    }

    const currentStudents = Array.from(this.prisma.memoryStore.students.values()).filter(
      (s) => s.tenantId === tenantId,
    ).length;

    const currentCampuses = Array.from(this.prisma.memoryStore.campuses.values()).filter(
      (c) => c.tenantId === tenantId,
    ).length;

    const currentStaff = Array.from(this.prisma.memoryStore.teachers.values()).filter(
      (t) => t.tenantId === tenantId,
    ).length;

    return {
      subscription: sub,
      planDetails: this.getPlanDetails(sub.tier || sub.planId),
      usage: {
        students: { used: currentStudents, limit: sub.maxStudents },
        campuses: { used: currentCampuses, limit: sub.maxCampuses },
        staff: { used: currentStaff, limit: sub.maxStaff },
      },
    };
  }

  async checkFeatureFlag(tenantId: string, featureName: string): Promise<boolean> {
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant || !tenant.features) return true;
    return !!tenant.features[featureName];
  }

  async overrideSubscription(tenantId: string, dto: QuotaOverrideDto) {
    const res = await this.getSubscription(tenantId);
    const sub = res.subscription;

    if (dto.maxStudents !== undefined) sub.maxStudents = dto.maxStudents;
    if (dto.maxCampuses !== undefined) sub.maxCampuses = dto.maxCampuses;
    if (dto.maxStaff !== undefined) sub.maxStaff = dto.maxStaff;
    if (dto.storageLimitMb !== undefined) sub.storageLimitMb = dto.storageLimitMb;
    if (dto.messagingQuota !== undefined) sub.messagingQuota = dto.messagingQuota;
    if (dto.status) sub.status = dto.status;
    sub.updatedAt = new Date();

    this.prisma.memoryStore.subscriptions.set(sub.id, sub);

    // Update tenant status if passed
    if (dto.status) {
      const tenant = this.prisma.memoryStore.tenants.get(tenantId);
      if (tenant) {
        tenant.status = dto.status;
        this.prisma.memoryStore.tenants.set(tenantId, tenant);
      }
    }

    return sub;
  }

  async getAllSubscriptions() {
    const list = Array.from(this.prisma.memoryStore.subscriptions.values());
    return list.map((sub: any) => {
      const tenant = this.prisma.memoryStore.tenants.get(sub.tenantId) || null;
      return {
        ...sub,
        tenantName: tenant?.name || sub.tenantId,
        tenantStatus: tenant?.status || 'UNKNOWN',
        planDetails: this.getPlanDetails(sub.tier || sub.planId),
      };
    });
  }
}
