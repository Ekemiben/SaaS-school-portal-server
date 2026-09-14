import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SubscribePlanDto, CancelSubscriptionDto } from './dto/subscribe-plan.dto.js';
import { PayBillingInvoiceDto } from './dto/billing-payment.dto.js';
import { SubscriptionsService, SAAS_PLANS } from '../subscriptions/subscriptions.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  getAvailablePlans() {
    return this.subscriptionsService.getAvailablePlans();
  }

  async getCurrentSubscription(tenantId: string) {
    const subRes = await this.subscriptionsService.getSubscription(tenantId);
    const invoices = await this.getBillingInvoices(tenantId);

    return {
      ...subRes.subscription,
      planDetails: subRes.planDetails,
      invoicesCount: invoices.length,
    };
  }

  async updateSubscription(tenantId: string, dto: SubscribePlanDto) {
    const planKey = (dto.planTier || '').toLowerCase();
    const plan = SAAS_PLANS[planKey];
    if (!plan) {
      throw new BadRequestException({
        errorCode: ErrorCodes.VALIDATION_FAILED,
        message: `Invalid subscription tier '${dto.planTier}'. Allowed: free_trial, starter, growth, enterprise, pro`,
      });
    }

    const isAnnual = (dto.billingCycle || '').toUpperCase() === 'ANNUALLY';
    const durationDays = isAnnual ? 365 : 30;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + durationDays * 86400000);

    const subscription = {
      id: `sub_${tenantId}`,
      tenantId,
      tier: plan.tier,
      planId: plan.tier,
      billingCycle: isAnnual ? 'ANNUALLY' : 'MONTHLY',
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      maxStudents: plan.maxStudents,
      maxCampuses: plan.maxCampuses,
      maxStaff: plan.maxStaff,
      storageLimitMb: plan.storageLimitMb,
      messagingQuota: plan.messagingQuota,
      trialEndsAt: plan.tier === 'free_trial' ? periodEnd : null,
      updatedAt: now,
      createdAt: now,
    };

    this.prisma.memoryStore.subscriptions.set(subscription.id, subscription);

    // Update tenant features in memory
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (tenant) {
      tenant.plan = plan.tier;
      tenant.status = 'ACTIVE';
      tenant.features = plan.features.reduce((acc: any, f: string) => {
        acc[f] = true;
        return acc;
      }, {});
      this.prisma.memoryStore.tenants.set(tenantId, tenant);
    }

    // Generate billing invoice
    const amount = isAnnual ? plan.annualPrice : plan.monthlyPrice;
    const invoiceId = `binv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const invoice = {
      id: invoiceId,
      tenantId,
      invoiceNumber: `INV-SAAS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      amount,
      currency: 'USD',
      status: amount === 0 ? 'PAID' : 'PAID', // auto-marked paid on immediate subscription
      planTier: plan.tier,
      billingCycle: isAnnual ? 'ANNUALLY' : 'MONTHLY',
      invoiceDate: now,
      dueDate: new Date(now.getTime() + 7 * 86400000),
      paidAt: now,
      pdfUrl: `https://billing.schoolportal.io/invoices/${invoiceId}.pdf`,
    };

    this.prisma.memoryStore.billingInvoices.set(invoiceId, invoice);

    return {
      subscription,
      invoice,
      message: `Successfully upgraded to ${plan.name} (${isAnnual ? 'ANNUALLY' : 'MONTHLY'})`,
    };
  }

  async cancelSubscription(tenantId: string, dto: CancelSubscriptionDto) {
    const subRes = await this.subscriptionsService.getSubscription(tenantId);
    const sub = subRes.subscription;

    sub.status = 'CANCELLED';
    sub.updatedAt = new Date();
    this.prisma.memoryStore.subscriptions.set(sub.id, sub);

    return {
      subscription: sub,
      message: `Subscription marked as CANCELLED. Access remains active until ${sub.currentPeriodEnd}.`,
      reason: dto.reason || 'User initiated cancellation',
    };
  }

  async getBillingInvoices(tenantId: string) {
    const invoices = Array.from(this.prisma.memoryStore.billingInvoices.values())
      .filter((inv: any) => inv.tenantId === tenantId)
      .sort((a: any, b: any) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());

    return invoices;
  }

  async payBillingInvoice(tenantId: string, invoiceId: string, dto: PayBillingInvoiceDto) {
    const invoice = this.prisma.memoryStore.billingInvoices.get(invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException(`Billing invoice '${invoiceId}' not found`);
    }

    if (invoice.status === 'PAID') {
      return { invoice, message: 'Invoice already paid' };
    }

    invoice.status = 'PAID';
    invoice.paidAt = new Date();
    invoice.paymentMethod = dto.paymentMethod;
    invoice.paymentReference = dto.paymentReference || `PAY-${Date.now()}`;
    this.prisma.memoryStore.billingInvoices.set(invoiceId, invoice);

    // Reactivate subscription if it was PAST_DUE or SUSPENDED
    const subRes = await this.subscriptionsService.getSubscription(tenantId);
    const sub = subRes.subscription;
    sub.status = 'ACTIVE';
    sub.updatedAt = new Date();
    this.prisma.memoryStore.subscriptions.set(sub.id, sub);

    // Restore tenant status to ACTIVE
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (tenant && (tenant.status === 'SUSPENDED' || tenant.status === 'PAST_DUE')) {
      tenant.status = 'ACTIVE';
      this.prisma.memoryStore.tenants.set(tenantId, tenant);
    }

    return {
      invoice,
      subscription: sub,
      message: `Invoice ${invoice.invoiceNumber || invoiceId} successfully paid`,
    };
  }
}
