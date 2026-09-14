import {
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SubscriptionsService, SAAS_PLANS } from './subscriptions.service.js';

@Injectable()
export class TenantLifecycleService {
  private readonly logger = new Logger(TenantLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async processAutomatedRenewals() {
    const now = new Date();
    const subscriptions = Array.from(this.prisma.memoryStore.subscriptions.values()).filter(
      (s: any) => s.status === 'ACTIVE' && s.currentPeriodEnd && new Date(s.currentPeriodEnd) <= now,
    );

    const renewed = [];
    const pastDue = [];

    for (const sub of subscriptions) {
      const plan = SAAS_PLANS[sub.tier || sub.planId] || SAAS_PLANS.growth;
      const isAnnual = (sub.billingCycle || '').toUpperCase() === 'ANNUALLY';
      const durationDays = isAnnual ? 365 : 30;
      const amount = isAnnual ? plan.annualPrice : plan.monthlyPrice;

      if (plan.tier === 'free_trial' || amount === 0) {
        // Trial ended, flag past due
        sub.status = 'PAST_DUE';
        sub.updatedAt = now;
        this.prisma.memoryStore.subscriptions.set(sub.id, sub);
        pastDue.push(sub);
      } else {
        // Generate pending renewal invoice
        const invoiceId = `binv_renew_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const invoice = {
          id: invoiceId,
          tenantId: sub.tenantId,
          invoiceNumber: `INV-RENEW-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          amount,
          currency: 'USD',
          status: 'PENDING',
          planTier: plan.tier,
          billingCycle: isAnnual ? 'ANNUALLY' : 'MONTHLY',
          invoiceDate: now,
          dueDate: new Date(now.getTime() + 7 * 86400000), // 7 days grace period
          paidAt: null,
          pdfUrl: `https://billing.schoolportal.io/invoices/${invoiceId}.pdf`,
        };
        this.prisma.memoryStore.billingInvoices.set(invoiceId, invoice);

        sub.status = 'PAST_DUE';
        sub.updatedAt = now;
        this.prisma.memoryStore.subscriptions.set(sub.id, sub);
        pastDue.push(sub);
      }
    }

    return {
      processedCount: subscriptions.length,
      renewedCount: renewed.length,
      pastDueCount: pastDue.length,
      pastDueSubscriptions: pastDue,
    };
  }

  async enforceTenantLifecycles() {
    const now = new Date();
    const suspendedTenants = [];

    const tenants = Array.from(this.prisma.memoryStore.tenants.values());

    for (const tenant of tenants) {
      if (tenant.status === 'DELETED' || tenant.status === 'ARCHIVED') {
        continue;
      }

      const sub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
        (s: any) => s.tenantId === tenant.id,
      );

      if (!sub) continue;

      // 1. Check expired trial
      if (sub.tier === 'free_trial' && sub.trialEndsAt && new Date(sub.trialEndsAt) < now) {
        tenant.status = 'SUSPENDED';
        sub.status = 'EXPIRED';
        sub.updatedAt = now;
        tenant.updatedAt = now;
        this.prisma.memoryStore.tenants.set(tenant.id, tenant);
        this.prisma.memoryStore.subscriptions.set(sub.id, sub);
        suspendedTenants.push({ tenantId: tenant.id, reason: 'Trial period expired' });
        continue;
      }

      // 2. Check overdue invoices past grace period (7 days)
      const overdueInvoices = Array.from(this.prisma.memoryStore.billingInvoices.values()).filter(
        (inv: any) =>
          inv.tenantId === tenant.id &&
          inv.status === 'PENDING' &&
          inv.dueDate &&
          new Date(inv.dueDate) < now,
      );

      if (overdueInvoices.length > 0 && sub.status === 'PAST_DUE') {
        tenant.status = 'SUSPENDED';
        sub.status = 'SUSPENDED';
        sub.updatedAt = now;
        tenant.updatedAt = now;
        this.prisma.memoryStore.tenants.set(tenant.id, tenant);
        this.prisma.memoryStore.subscriptions.set(sub.id, sub);
        suspendedTenants.push({
          tenantId: tenant.id,
          reason: `Unpaid renewal invoice overdue past grace period (${overdueInvoices.length} overdue invoices)`,
        });
      }
    }

    return {
      enforcedCount: suspendedTenants.length,
      suspendedTenants,
    };
  }

  checkTenantOperationAllowed(tenantId: string) {
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (tenant && tenant.status === 'SUSPENDED') {
      throw new ForbiddenException(
        `Tenant account '${tenant.name || tenantId}' is SUSPENDED due to an expired subscription or overdue invoice. Please settle outstanding invoices to restore access.`,
      );
    }
    if (tenant && tenant.status === 'DELETED') {
      throw new ForbiddenException(`Tenant account '${tenantId}' has been deleted.`);
    }
    return { allowed: true, status: tenant?.status || 'ACTIVE' };
  }
}
