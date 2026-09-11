import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SubscribePlanDto } from './dto/subscribe-plan.dto.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly PLANS = {
    starter: {
      tier: 'starter',
      name: 'Starter Tier',
      monthlyPrice: 99,
      annualPrice: 990,
      maxStudents: 300,
      maxCampuses: 1,
      maxStaff: 30,
      storageLimitMb: 5000,
      features: ['academics', 'attendance', 'reports'],
    },
    pro: {
      tier: 'pro',
      name: 'Pro Multi-Campus',
      monthlyPrice: 249,
      annualPrice: 2490,
      maxStudents: 2000,
      maxCampuses: 3,
      maxStaff: 150,
      storageLimitMb: 50000,
      features: ['academics', 'attendance', 'examinations', 'fees', 'onlinePayments', 'payroll', 'transport', 'reports'],
    },
    enterprise: {
      tier: 'enterprise',
      name: 'Enterprise School System',
      monthlyPrice: 599,
      annualPrice: 5990,
      maxStudents: 10000,
      maxCampuses: 10,
      maxStaff: 1000,
      storageLimitMb: 250000,
      features: ['academics', 'attendance', 'examinations', 'fees', 'onlinePayments', 'payroll', 'transport', 'reports', 'audit', 'customDomain'],
    },
  };

  getAvailablePlans() {
    return Object.values(this.PLANS);
  }

  async getCurrentSubscription(tenantId: string) {
    const sub = this.prisma.memoryStore.subscriptions.get(tenantId);
    if (!sub) {
      return {
        tenantId,
        tier: 'starter',
        status: 'TRIALING',
        currentPeriodEnd: new Date(Date.now() + 14 * 86400000),
        planDetails: this.PLANS.starter,
      };
    }
    return {
      ...sub,
      planDetails: this.PLANS[sub.tier as keyof typeof this.PLANS] || this.PLANS.pro,
    };
  }

  async updateSubscription(tenantId: string, dto: SubscribePlanDto) {
    const plan = this.PLANS[dto.planTier];
    if (!plan) {
      throw new BadRequestException({
        errorCode: ErrorCodes.VALIDATION_FAILED,
        message: 'Invalid subscription tier selected',
      });
    }

    const durationDays = dto.billingCycle === 'ANNUALLY' ? 365 : 30;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + durationDays * 86400000);

    const subscription = {
      id: `sub_${tenantId}`,
      tenantId,
      tier: dto.planTier,
      billingCycle: dto.billingCycle,
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      maxStudents: plan.maxStudents,
      maxCampuses: plan.maxCampuses,
      maxStaff: plan.maxStaff,
      storageLimitMb: plan.storageLimitMb,
      updatedAt: now,
    };

    this.prisma.memoryStore.subscriptions.set(tenantId, subscription);

    // Update tenant features in memory
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (tenant) {
      tenant.plan = dto.planTier;
      tenant.features = plan.features.reduce((acc: any, f: string) => {
        acc[f] = true;
        return acc;
      }, {});
      this.prisma.memoryStore.tenants.set(tenantId, tenant);
    }

    // Generate billing invoice record
    const invoiceId = `binv_${Date.now()}`;
    const amount = dto.billingCycle === 'ANNUALLY' ? plan.annualPrice : plan.monthlyPrice;
    this.prisma.memoryStore.billingInvoices.set(invoiceId, {
      id: invoiceId,
      tenantId,
      amount,
      currency: 'USD',
      status: 'PAID',
      planTier: dto.planTier,
      billingCycle: dto.billingCycle,
      invoiceDate: now,
      paidAt: now,
      pdfUrl: `https://billing.schoolportal.io/invoices/${invoiceId}.pdf`,
    });

    return {
      subscription,
      invoiceId,
      message: `Successfully upgraded to ${plan.name} (${dto.billingCycle})`,
    };
  }

  async getBillingInvoices(tenantId: string) {
    const invoices = Array.from(this.prisma.memoryStore.billingInvoices.values())
      .filter((inv) => inv.tenantId === tenantId)
      .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());

    return invoices;
  }
}
