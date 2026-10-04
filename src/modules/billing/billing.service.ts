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
        message: `Invalid subscription tier '${dto.planTier}'. Allowed: free_trial, starter, growth, enterprise, pro, standard, premium, custom`,
      });
    }

    const isAnnual = (dto.billingCycle || '').toUpperCase() === 'ANNUALLY' || (dto.billingCycle || '').toUpperCase() === 'ANNUAL';
    const durationDays = isAnnual ? 365 : (dto.planTier?.toLowerCase() === 'free_trial' ? 60 : 30);
    const now = new Date();
    const periodEnd = new Date(now.getTime() + durationDays * 86400000);
    const subId = `sub_${tenantId.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const amount = isAnnual ? plan.annualPrice : plan.monthlyPrice;

    // Direct Prisma DB queries
    let planRow = await this.prisma.subscriptionPlan.findFirst({
      where: {
        OR: [
          { tier: plan.tier.toUpperCase() },
          { tier: planKey.toUpperCase() },
        ],
      },
    });

    const subscription = await this.prisma.subscription.upsert({
      where: { id: subId },
      create: {
        id: subId,
        tenantId,
        planId: planRow?.id || null,
        planTier: plan.tier.toUpperCase(),
        billingCycle: isAnnual ? 'ANNUAL' : 'MONTHLY',
        status: plan.tier === 'free_trial' ? 'TRIAL' : 'ACTIVE',
        priceAtPurchase: amount,
        currency: planRow?.currency || 'USD',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        maxStudents: plan.maxStudents,
        maxCampuses: plan.maxCampuses,
        maxStaff: plan.maxStaff,
        storageLimitMb: plan.storageLimitMb,
        trialEndsAt: plan.tier === 'free_trial' ? periodEnd : null,
      },
      update: {
        planId: planRow?.id || null,
        planTier: plan.tier.toUpperCase(),
        billingCycle: isAnnual ? 'ANNUAL' : 'MONTHLY',
        status: plan.tier === 'free_trial' ? 'TRIAL' : 'ACTIVE',
        priceAtPurchase: amount,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        maxStudents: plan.maxStudents,
        maxCampuses: plan.maxCampuses,
        maxStaff: plan.maxStaff,
        storageLimitMb: plan.storageLimitMb,
        trialEndsAt: plan.tier === 'free_trial' ? periodEnd : null,
        updatedAt: now,
      },
    });

    // Update tenant features in DB
    const featuresMap = plan.features.reduce((acc: Record<string, boolean>, f: string) => {
      acc[f] = true;
      return acc;
    }, {});

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan: plan.tier.toLowerCase(),
        status: plan.tier === 'free_trial' ? 'TRIAL' : 'ACTIVE',
        features: featuresMap,
        updatedAt: now,
      },
    }).catch(() => {});

    // Generate billing invoice in DB
    const invoiceId = `binv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const invoiceNumber = `INV-SAAS-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const invoice = await this.prisma.billingInvoice.create({
      data: {
        id: invoiceId,
        tenantId,
        subscriptionId: subscription.id,
        invoiceNumber,
        amount,
        currency: planRow?.currency || 'USD',
        status: 'PAID',
        dueDate: new Date(now.getTime() + 7 * 86400000),
        paidAt: now,
        paymentMethod: 'Instant Card Billing',
        lineItems: [
          {
            description: `Subscription: ${plan.name} (${isAnnual ? 'ANNUAL' : 'MONTHLY'})`,
            amount,
            quantity: 1,
          },
        ],
      },
    });

    return {
      subscription: {
        ...subscription,
        tier: plan.tier,
      },
      invoice: {
        ...invoice,
        pdfUrl: `https://billing.schoolportal.io/invoices/${invoiceId}.pdf`,
      },
      message: `Successfully upgraded to ${plan.name} (${isAnnual ? 'ANNUALLY' : 'MONTHLY'})`,
    };
  }

  async cancelSubscription(tenantId: string, dto: CancelSubscriptionDto) {
    const subRes = await this.subscriptionsService.getSubscription(tenantId);
    const sub = subRes.subscription;

    const updatedSub = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'CANCELLED',
        autoRenew: false,
        updatedAt: new Date(),
      },
    });

    return {
      subscription: updatedSub,
      message: `Subscription marked as CANCELLED. Access remains active until ${sub.currentPeriodEnd}.`,
      reason: dto.reason || 'User initiated cancellation',
    };
  }

  async getBillingInvoices(tenantId: string) {
    const invoices = await this.prisma.billingInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return invoices;
  }

  async payBillingInvoice(tenantId: string, invoiceId: string, dto: PayBillingInvoiceDto) {
    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!invoice) {
      throw new NotFoundException(`Billing invoice '${invoiceId}' not found`);
    }

    if (invoice.status === 'PAID') {
      return { invoice, message: 'Invoice already paid' };
    }

    const now = new Date();
    const updatedInvoice = await this.prisma.billingInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        paidAt: now,
        paymentMethod: dto.paymentMethod,
        updatedAt: now,
      },
    });

    // Reactivate subscription if it was PAST_DUE or SUSPENDED
    const subRes = await this.subscriptionsService.getSubscription(tenantId);
    const sub = subRes.subscription;

    const updatedSub = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'ACTIVE',
        updatedAt: now,
      },
    });

    // Restore tenant status to ACTIVE
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (tenant && (tenant.status === 'SUSPENDED' || (tenant.status as any) === 'PAST_DUE')) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'ACTIVE',
          updatedAt: now,
        },
      });
    }

    return {
      invoice: updatedInvoice,
      subscription: updatedSub,
      message: `Invoice ${invoice.invoiceNumber || invoiceId} successfully paid`,
    };
  }
}
