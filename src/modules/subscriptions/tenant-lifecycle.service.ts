import {
  Injectable,
  ForbiddenException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  forwardRef,
  Inject,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { PgBossService } from '../../infrastructure/queues/pg-boss/pg-boss.service.js';

@Injectable()
export class TenantLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantLifecycleService.name);
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    @Optional()
    private readonly pgBossService?: PgBossService,
  ) {}

  async onModuleInit() {
    // 1. Register background worker on pg-boss queue
    if (this.pgBossService) {
      try {
        await this.pgBossService.work(
          'subscription-lifecycle-enforcement',
          async (job) => {
            this.logger.log(`Executing background subscription lifecycle job: ${job.id}`);
            await this.enforceTenantLifecycles();
          },
        );

        // Register periodic schedule with pg-boss engine if available
        const boss = this.pgBossService.getBoss();
        if (boss && typeof (boss as any).schedule === 'function') {
          await (boss as any).schedule('subscription-lifecycle-enforcement', '0 * * * *', {});
          this.logger.log('pg-boss hourly subscription lifecycle cron registered.');
        }
      } catch (err: any) {
        this.logger.warn(`pg-boss queue registration note: ${err?.message}`);
      }
    }

    // 2. Reliable in-process heartbeat timer (runs every hour)
    this.heartbeatTimer = setInterval(
      () => {
        this.enforceTenantLifecycles().catch((err) => {
          this.logger.error(`Heartbeat lifecycle enforcement error: ${err?.message}`);
        });
      },
      60 * 60 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Evaluates active subscriptions nearing expiration, generating renewal invoices
   * and transitioning expired/unpaid subscriptions to PAST_DUE.
   */
  async processAutomatedRenewals() {
    const now = new Date();
    const results = {
      processedCount: 0,
      renewedCount: 0,
      invoicedCount: 0,
      pastDueCount: 0,
      pastDueSubscriptions: [] as any[],
    };

    const expiringSubs = await this.prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { lte: new Date(now.getTime() + 3 * 86400000) },
      },
      include: { plan: true, tenant: true },
    });

    for (const sub of expiringSubs) {
      results.processedCount++;
      const plan = sub.plan;
      const isAnnual = sub.billingCycle === 'ANNUAL';
      const price = isAnnual
        ? Number(plan?.annualPrice || 987000)
        : Number(plan?.termlyPrice || 350000);

      const existingInvoice = await this.prisma.billingInvoice.findFirst({
        where: {
          tenantId: sub.tenantId,
          subscriptionId: sub.id,
          status: 'PENDING',
        },
      });

      if (!existingInvoice) {
        const invoiceNumber = `SUB-RENEW-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const invoice = await this.prisma.billingInvoice.create({
          data: {
            id: `binv_renew_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId: sub.tenantId,
            subscriptionId: sub.id,
            invoiceNumber,
            amount: price,
            currency: sub.currency || 'NGN',
            status: 'PENDING',
            dueDate: new Date(now.getTime() + 7 * 86400000), // 7 days grace period
            paymentMethod: 'Automatic Subscription Billing',
            lineItems: [
              {
                description: `Subscription Renewal: ${plan?.name || sub.planTier} (${sub.billingCycle})`,
                amount: price,
                quantity: 1,
              },
            ],
          },
        });
        results.invoicedCount++;

        // If subscription period has passed end date without payment, transition to PAST_DUE
        if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) <= now) {
          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'PAST_DUE', updatedAt: now },
          });

          results.pastDueCount++;
          results.pastDueSubscriptions.push({
            tenantId: sub.tenantId,
            tenantName: sub.tenant?.name,
            subscriptionId: sub.id,
            invoiceId: invoice.id,
          });
        }
      }
    }

    return results;
  }

  /**
   * Enforces server-side subscription lifecycle transitions independently of tenant logins.
   * Handles:
   * 1. Expired trials (TRIAL -> EXPIRED, Tenant -> SUSPENDED)
   * 2. Overdue subscriptions past grace period (ACTIVE/PAST_DUE -> SUSPENDED)
   * 3. Expired promotional feature overrides (isEnabled -> false)
   */
  async enforceTenantLifecycles() {
    const now = new Date();
    const results = {
      enforcedCount: 0,
      expiredTrials: [] as any[],
      suspendedOverdue: [] as any[],
      expiredIncentives: [] as any[],
    };

    // 1. Check Expired 2-Month Trials (TRIAL status with trialEndsAt < now)
    const expiredTrials = await this.prisma.subscription.findMany({
      where: {
        status: 'TRIAL',
        trialEndsAt: { lt: now },
      },
      include: { tenant: true },
    });

    for (const sub of expiredTrials) {
      await this.prisma.$transaction([
        this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'EXPIRED', updatedAt: now },
        }),
        this.prisma.tenant.update({
          where: { id: sub.tenantId },
          data: { status: 'SUSPENDED', updatedAt: now },
        }),
        this.prisma.auditLog.create({
          data: {
            id: `aud_trial_exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId: sub.tenantId,
            action: 'TRIAL_SUBSCRIPTION_EXPIRED',
            resourceType: 'Subscription',
            resourceId: sub.id,
            afterData: {
              status: 'EXPIRED',
              tenantStatus: 'SUSPENDED',
              trialEndsAt: sub.trialEndsAt,
            },
          },
        }),
      ]);

      results.expiredTrials.push({
        tenantId: sub.tenantId,
        tenantName: sub.tenant?.name,
        subscriptionId: sub.id,
        trialEndsAt: sub.trialEndsAt,
      });
    }

    // 2. Check Overdue Subscriptions Past Grace Period (7 days after period end)
    const graceCutoff = new Date(now.getTime() - 7 * 86400000);
    const overdueSubs = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        currentPeriodEnd: { lt: graceCutoff },
      },
      include: { tenant: true },
    });

    for (const sub of overdueSubs) {
      await this.prisma.$transaction([
        this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'SUSPENDED', updatedAt: now },
        }),
        this.prisma.tenant.update({
          where: { id: sub.tenantId },
          data: { status: 'SUSPENDED', updatedAt: now },
        }),
        this.prisma.auditLog.create({
          data: {
            id: `aud_overdue_susp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId: sub.tenantId,
            action: 'SUBSCRIPTION_GRACE_PERIOD_EXCEEDED_SUSPENDED',
            resourceType: 'Subscription',
            resourceId: sub.id,
            afterData: {
              status: 'SUSPENDED',
              tenantStatus: 'SUSPENDED',
              currentPeriodEnd: sub.currentPeriodEnd,
            },
          },
        }),
      ]);

      results.suspendedOverdue.push({
        tenantId: sub.tenantId,
        tenantName: sub.tenant?.name,
        subscriptionId: sub.id,
        currentPeriodEnd: sub.currentPeriodEnd,
      });
    }

    // 3. Check Expired Promotional Feature Overrides (isEnabled = true and expiresAt < now)
    const expiredIncentives = await this.prisma.subscriptionFeatureOverride.findMany({
      where: {
        isEnabled: true,
        expiresAt: { lt: now },
      },
    });

    for (const ov of expiredIncentives) {
      await this.prisma.$transaction([
        this.prisma.subscriptionFeatureOverride.update({
          where: { id: ov.id },
          data: { isEnabled: false, updatedAt: now },
        }),
        this.prisma.auditLog.create({
          data: {
            id: `aud_inc_exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId: ov.tenantId,
            action: 'PROMOTIONAL_INCENTIVE_EXPIRED',
            resourceType: 'SubscriptionFeatureOverride',
            resourceId: ov.id,
            afterData: {
              featureKey: ov.featureKey,
              isEnabled: false,
              expiresAt: ov.expiresAt,
            },
          },
        }),
      ]);

      results.expiredIncentives.push({
        tenantId: ov.tenantId,
        featureKey: ov.featureKey,
        expiresAt: ov.expiresAt,
      });
    }

    results.enforcedCount =
      results.expiredTrials.length +
      results.suspendedOverdue.length +
      results.expiredIncentives.length;

    this.logger.log(
      `Enforce lifecycles complete: ${results.expiredTrials.length} expired trials, ${results.suspendedOverdue.length} suspended overdue, ${results.expiredIncentives.length} expired promotional incentives (total enforced: ${results.enforcedCount}).`,
    );

    return results;
  }

  /**
   * Super Admin / Payment Activation: Activates a school subscription upon payment.
   * Transitions PENDING, TRIAL, PAST_DUE, or EXPIRED -> ACTIVE.
   */
  async activateSubscription(
    tenantId: string,
    options?: {
      planTier?: string;
      billingCycle?: string;
      durationDays?: number;
      amount?: number;
      paymentMethod?: string;
      adminEmail?: string;
    },
  ) {
    const now = new Date();
    const cycle = (options?.billingCycle || 'TERMLY').toUpperCase();
    const isAnnual = cycle === 'ANNUAL' || cycle === 'YEARLY';
    const duration = options?.durationDays || (isAnnual ? 365 : 90);
    const periodEnd = new Date(now.getTime() + duration * 86400000);

    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
      include: { plan: true },
    });

    const targetTier = (options?.planTier || sub?.planTier || 'STANDARD').toUpperCase();
    let plan = await this.prisma.subscriptionPlan.findUnique({
      where: { tier: targetTier },
    });
    if (!plan) {
      plan = await this.prisma.subscriptionPlan.findFirst();
    }

    const price =
      options?.amount ??
      (isAnnual ? Number(plan?.annualPrice || 987000) : Number(plan?.termlyPrice || 350000));

    const subId = sub?.id || `sub_${tenantId.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const updatedSub = await this.prisma.subscription.upsert({
      where: { id: subId },
      create: {
        id: subId,
        tenantId,
        planId: plan?.id,
        planTier: targetTier,
        status: 'ACTIVE',
        billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
        priceAtPurchase: price,
        currency: plan?.currency || 'NGN',
        trialEndsAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        maxStudents: plan?.maxStudents || 1500,
        maxCampuses: plan?.maxCampuses || 3,
        maxStaff: plan?.maxStaff || 100,
        storageLimitMb: plan?.storageLimitMb || 25600,
        autoRenew: true,
      },
      update: {
        planId: plan?.id,
        planTier: targetTier,
        status: 'ACTIVE',
        billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
        priceAtPurchase: price,
        trialEndsAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        maxStudents: plan?.maxStudents,
        maxCampuses: plan?.maxCampuses,
        maxStaff: plan?.maxStaff,
        storageLimitMb: plan?.storageLimitMb,
        updatedAt: now,
      },
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'ACTIVE',
        plan: targetTier.toLowerCase(),
        updatedAt: now,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        id: `aud_act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        action: 'SUBSCRIPTION_ACTIVATED',
        resourceType: 'Subscription',
        resourceId: updatedSub.id,
        afterData: {
          status: 'ACTIVE',
          planTier: targetTier,
          billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
          currentPeriodEnd: periodEnd,
          activatedBy: options?.adminEmail || 'Platform Super Admin',
        },
      },
    });

    return {
      success: true,
      subscription: updatedSub,
      message: `Subscription successfully activated on ${targetTier} plan.`,
    };
  }

  /**
   * Super Admin: Manually suspends a school subscription and deactivates portal access.
   */
  async suspendSubscription(tenantId: string, reason?: string) {
    const now = new Date();
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });

    if (sub) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'SUSPENDED', updatedAt: now },
      });
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'SUSPENDED', updatedAt: now },
    });

    await this.prisma.auditLog.create({
      data: {
        id: `aud_susp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        action: 'SUBSCRIPTION_MANUALLY_SUSPENDED',
        resourceType: 'Subscription',
        resourceId: sub?.id || tenantId,
        afterData: {
          status: 'SUSPENDED',
          tenantStatus: 'SUSPENDED',
          reason: reason || 'Administrative suspension',
        },
      },
    });

    return {
      success: true,
      status: 'SUSPENDED',
      message: `School tenant and subscription successfully suspended.`,
    };
  }

  /**
   * Super Admin: Restores a suspended school subscription and portal access.
   */
  async reactivateSubscription(tenantId: string) {
    const now = new Date();
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });

    const periodEnd =
      sub?.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now
        ? sub.currentPeriodEnd
        : new Date(now.getTime() + 30 * 86400000);

    if (sub) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: periodEnd,
          updatedAt: now,
        },
      });
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE', updatedAt: now },
    });

    await this.prisma.auditLog.create({
      data: {
        id: `aud_react_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        action: 'SUBSCRIPTION_REACTIVATED',
        resourceType: 'Subscription',
        resourceId: sub?.id || tenantId,
        afterData: {
          status: 'ACTIVE',
          tenantStatus: 'ACTIVE',
        },
      },
    });

    return {
      success: true,
      status: 'ACTIVE',
      message: `School tenant and subscription successfully restored to ACTIVE.`,
    };
  }

  /**
   * Super Admin / Tenant: Cancels subscription auto-renewal.
   */
  async cancelSubscription(tenantId: string, reason?: string) {
    const now = new Date();
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });

    if (sub) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'CANCELLED', autoRenew: false, updatedAt: now },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        id: `aud_canc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        action: 'SUBSCRIPTION_CANCELLED',
        resourceType: 'Subscription',
        resourceId: sub?.id || tenantId,
        afterData: {
          status: 'CANCELLED',
          reason: reason || 'Tenant requested cancellation',
        },
      },
    });

    return {
      success: true,
      status: 'CANCELLED',
      message: `Subscription successfully cancelled.`,
    };
  }

  /**
   * Server-side gatekeeper: Verifies if a school tenant is authorized to perform operations.
   * Gating checks directly against PostgreSQL tenant and subscription records.
   */
  async checkTenantOperationAllowed(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!tenant) {
      return { allowed: true, status: 'ACTIVE' };
    }

    if (tenant.status === 'SUSPENDED') {
      throw new ForbiddenException(
        `Tenant account '${tenant.name || tenantId}' is SUSPENDED due to an expired subscription or overdue invoice. Please settle outstanding invoices to restore access.`,
      );
    }
    if (tenant.status === 'DELETED') {
      throw new ForbiddenException(`Tenant account '${tenantId}' has been deleted.`);
    }

    const sub = tenant.subscriptions?.[0];
    if (sub && sub.status === 'EXPIRED') {
      throw new ForbiddenException(
        `Your school's subscription or trial has EXPIRED. Please renew your plan to continue using portal operations.`,
      );
    }
    if (sub && sub.status === 'SUSPENDED') {
      throw new ForbiddenException(
        `Your school's subscription is SUSPENDED. Please settle outstanding renewals to restore access.`,
      );
    }

    return { allowed: true, status: tenant.status };
  }
}
