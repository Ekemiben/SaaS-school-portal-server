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
import { SubscriptionsService, SAAS_PLANS } from './subscriptions.service.js';
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

    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        this.logger.error(`Error processing database renewals: ${err?.message}`);
      }
    }

    // Process In-Memory Subscriptions (supports unit tests and memory fallback)
    const memSubs = Array.from(this.prisma.memoryStore.subscriptions.values()).filter(
      (s: any) => s.status === 'ACTIVE' && s.currentPeriodEnd && new Date(s.currentPeriodEnd) <= now,
    );

    for (const sub of memSubs) {
      if (results.pastDueSubscriptions.some((p: any) => p.subscriptionId === sub.id || p.id === sub.id)) {
        continue;
      }
      results.processedCount++;

      const planKey = (sub.tier || 'starter').toLowerCase();
      const plan = (SAAS_PLANS as any)[planKey] || SAAS_PLANS.starter;
      const isAnnual = sub.billingCycle === 'ANNUALLY' || sub.billingCycle === 'ANNUAL';
      const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;

      const existingInvoices = Array.from(this.prisma.memoryStore.billingInvoices.values()).filter(
        (inv: any) => inv.tenantId === sub.tenantId && inv.status === 'PENDING',
      );

      if (existingInvoices.length === 0) {
        const invoiceId = `binv_renew_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const invoice = {
          id: invoiceId,
          tenantId: sub.tenantId,
          subscriptionId: sub.id,
          invoiceNumber: `INV-RENEW-${Date.now()}`,
          amount: price,
          currency: 'USD',
          status: 'PENDING',
          dueDate: new Date(now.getTime() + 7 * 86400000),
          createdAt: now,
          lineItems: [
            {
              description: `Subscription Renewal - ${plan.name} (${sub.billingCycle})`,
              amount: price,
              quantity: 1,
            },
          ],
        };
        this.prisma.memoryStore.billingInvoices.set(invoiceId, invoice);
        results.invoicedCount++;
      }

      sub.status = 'PAST_DUE';
      sub.updatedAt = now;
      this.prisma.memoryStore.subscriptions.set(sub.id, sub);
      results.pastDueSubscriptions.push(sub);
      results.pastDueCount++;
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

    if (this.prisma.isDbConnected) {
      try {
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

          // Sync Memory Store
          const memSub = this.prisma.memoryStore.subscriptions.get(sub.id);
          if (memSub) {
            memSub.status = 'EXPIRED';
            memSub.updatedAt = now;
          }
          const memTenant = this.prisma.memoryStore.tenants.get(sub.tenantId);
          if (memTenant) {
            memTenant.status = 'SUSPENDED';
            memTenant.updatedAt = now;
          }

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

          // Sync Memory Store
          const memSub = this.prisma.memoryStore.subscriptions.get(sub.id);
          if (memSub) {
            memSub.status = 'SUSPENDED';
            memSub.updatedAt = now;
          }
          const memTenant = this.prisma.memoryStore.tenants.get(sub.tenantId);
          if (memTenant) {
            memTenant.status = 'SUSPENDED';
            memTenant.updatedAt = now;
          }

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
      } catch (err: any) {
        this.logger.error(`Error enforcing database lifecycles: ${err?.message}`);
      }
    }

    // In-Memory Fallback & Unit Test Processing
    const tenants = Array.from(this.prisma.memoryStore.tenants.values());
    for (const tenant of tenants) {
      const sub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
        (s: any) => s.tenantId === tenant.id,
      );
      if (!sub) continue;

      // 1. Expired Trial in memory
      if (sub.status === 'TRIAL' && sub.trialEndsAt && new Date(sub.trialEndsAt) < now) {
        if (!results.expiredTrials.some((t: any) => t.tenantId === tenant.id)) {
          tenant.status = 'SUSPENDED';
          sub.status = 'EXPIRED';
          this.prisma.memoryStore.tenants.set(tenant.id, tenant);
          this.prisma.memoryStore.subscriptions.set(sub.id, sub);
          results.expiredTrials.push({ tenantId: tenant.id, subscriptionId: sub.id });
        }
      }
    }

    // 2. Overdue Invoices past grace period in memory
    const overdueInvoices = Array.from(this.prisma.memoryStore.billingInvoices.values()).filter(
      (inv: any) => inv.status === 'PENDING' && inv.dueDate && new Date(inv.dueDate) < now,
    );
    for (const inv of overdueInvoices) {
      const tenant = this.prisma.memoryStore.tenants.get(inv.tenantId);
      const sub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
        (s: any) => s.tenantId === inv.tenantId,
      );
      if (tenant && tenant.status !== 'SUSPENDED') {
        tenant.status = 'SUSPENDED';
        this.prisma.memoryStore.tenants.set(tenant.id, tenant);
        if (sub) {
          sub.status = 'SUSPENDED';
          this.prisma.memoryStore.subscriptions.set(sub.id, sub);
        }
        if (!results.suspendedOverdue.some((s: any) => s.tenantId === inv.tenantId)) {
          results.suspendedOverdue.push({ tenantId: inv.tenantId, invoiceId: inv.id });
        }
      }
    }

    // 3. Expired Promotional Feature Overrides in memory
    const memoryOverrides = Array.from(((this.prisma.memoryStore as any).featureOverrides?.values?.() || []) as any[]);
    for (const ov of memoryOverrides) {
      if (ov.isEnabled && ov.expiresAt && new Date(ov.expiresAt) < now) {
        ov.isEnabled = false;
        ov.updatedAt = now;
        (this.prisma.memoryStore as any).featureOverrides.set(`${ov.subscriptionId}_${ov.featureKey}`, ov);
        if (!results.expiredIncentives.some((i: any) => i.tenantId === ov.tenantId && i.featureKey === ov.featureKey)) {
          results.expiredIncentives.push({
            tenantId: ov.tenantId,
            featureKey: ov.featureKey,
            expiresAt: ov.expiresAt,
          });
        }
      }
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

    if (this.prisma.isDbConnected) {
      try {
        let sub = await this.prisma.subscription.findFirst({
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

        // Sync Memory Store
        this.prisma.memoryStore.subscriptions.set(updatedSub.id, {
          ...updatedSub,
          tier: targetTier.toLowerCase(),
        });
        const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
        if (memTenant) {
          memTenant.status = 'ACTIVE';
          memTenant.plan = targetTier.toLowerCase();
        }

        return {
          success: true,
          subscription: updatedSub,
          message: `Subscription successfully activated on ${targetTier} plan.`,
        };
      } catch (err: any) {
        this.logger.warn(`Error activating subscription in DB: ${err?.message}. Falling back to memory store.`);
      }
    }
    const targetTier = (options?.planTier || 'STANDARD').toUpperCase();
    const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (memTenant) {
      memTenant.status = 'ACTIVE';
      memTenant.plan = targetTier.toLowerCase();
      this.prisma.memoryStore.tenants.set(tenantId, memTenant);
    }
    let memSub: any = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
      (s: any) => s.tenantId === tenantId,
    );
    const subId = memSub?.id || `sub_${tenantId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (!memSub) {
      memSub = {
        id: subId,
        tenantId,
        planId: `plan-${targetTier.toLowerCase()}`,
        planTier: targetTier,
        tier: targetTier.toLowerCase(),
        status: 'ACTIVE',
        billingCycle: cycle,
        priceAtPurchase: options?.amount || (isAnnual ? 987000 : 350000),
        currency: 'NGN',
        trialEndsAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        maxStudents: 1500,
        maxCampuses: 3,
        maxStaff: 100,
        storageLimitMb: 25600,
        autoRenew: true,
      };
    } else {
      memSub.status = 'ACTIVE';
      memSub.planTier = targetTier;
      memSub.tier = targetTier.toLowerCase();
      memSub.trialEndsAt = null;
      memSub.currentPeriodEnd = periodEnd;
    }
    this.prisma.memoryStore.subscriptions.set(subId, memSub);
    return {
      success: true,
      subscription: memSub,
      message: `Subscription successfully activated on ${targetTier} plan.`,
    };
  }

  /**
   * Super Admin: Manually suspends a school subscription and deactivates portal access.
   */
  async suspendSubscription(tenantId: string, reason?: string) {
    const now = new Date();
    if (this.prisma.isDbConnected) {
      try {
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

        // Sync Memory Store
        if (sub) {
          const memSub = this.prisma.memoryStore.subscriptions.get(sub.id);
          if (memSub) memSub.status = 'SUSPENDED';
        }
        const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
        if (memTenant) memTenant.status = 'SUSPENDED';

        return {
          success: true,
          status: 'SUSPENDED',
          message: `School tenant and subscription successfully suspended.`,
        };
      } catch (err: any) {
        this.logger.error(`Error suspending subscription: ${err?.message}`);
        throw err;
      }
    }
    const memSub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
      (s: any) => s.tenantId === tenantId,
    );
    if (memSub) memSub.status = 'SUSPENDED';
    const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (memTenant) memTenant.status = 'SUSPENDED';

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
    if (this.prisma.isDbConnected) {
      try {
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

        // Sync Memory Store
        if (sub) {
          const memSub = this.prisma.memoryStore.subscriptions.get(sub.id);
          if (memSub) {
            memSub.status = 'ACTIVE';
            memSub.currentPeriodEnd = periodEnd;
          }
        }
        const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
        if (memTenant) memTenant.status = 'ACTIVE';

        return {
          success: true,
          status: 'ACTIVE',
          message: `School tenant and subscription successfully restored to ACTIVE.`,
        };
      } catch (err: any) {
        this.logger.error(`Error reactivating subscription: ${err?.message}`);
        throw err;
      }
    }
    const memSub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
      (s: any) => s.tenantId === tenantId,
    );
    if (memSub) {
      memSub.status = 'ACTIVE';
      memSub.currentPeriodEnd = new Date(now.getTime() + 30 * 86400000);
      this.prisma.memoryStore.subscriptions.set(memSub.id, memSub);
    }
    const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (memTenant) {
      memTenant.status = 'ACTIVE';
      this.prisma.memoryStore.tenants.set(tenantId, memTenant);
    }

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
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        this.logger.error(`Error cancelling subscription: ${err?.message}`);
        throw err;
      }
    }

    return { success: false, message: 'Database not connected.' };
  }

  /**
   * Server-side gatekeeper: Verifies if a school tenant is authorized to perform operations.
   * Synchronous check on state store ensuring zero-latency request pipeline gating.
   */
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

    const sub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
      (s: any) => s.tenantId === tenantId,
    );
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

    return { allowed: true, status: tenant?.status || 'ACTIVE' };
  }
}
