import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service.js';
import { BillingService } from '../src/modules/billing/billing.service.js';
import { TenantLifecycleService } from '../src/modules/subscriptions/tenant-lifecycle.service.js';

describe('Subscription Upgrades, Renewal Invoices & Payment Processing', () => {
  let prisma: PrismaService;
  let subService: SubscriptionsService;
  let billingService: BillingService;
  let lifecycleService: TenantLifecycleService;

  const tenantId = 'tenant_greenfield_100';

  beforeEach(() => {
    prisma = new PrismaService();
    subService = new SubscriptionsService(prisma);
    billingService = new BillingService(prisma, subService);
    lifecycleService = new TenantLifecycleService(prisma, subService);
  });

  it('should upgrade plan tier, update tenant features, and generate billing invoice', async () => {
    // 1. Initial tenant starts on Free Trial
    await billingService.updateSubscription(tenantId, {
      planTier: 'free_trial',
      billingCycle: 'MONTHLY',
    });

    const initialTenant = prisma.memoryStore.tenants.get(tenantId);
    expect(initialTenant.plan).toBe('free_trial');

    // 2. Upgrade to Growth Plan (Annually: $2,490)
    const result = await billingService.updateSubscription(tenantId, {
      planTier: 'growth',
      billingCycle: 'ANNUALLY',
    });

    expect(result.subscription.tier).toBe('growth');
    expect(result.subscription.billingCycle).toBe('ANNUALLY');
    expect(result.subscription.maxStudents).toBe(1500);
    expect(result.subscription.maxCampuses).toBe(3);
    expect(result.invoice.amount).toBe(2490);
    expect(result.invoice.status).toBe('PAID');

    // 3. Verify tenant features were synchronized
    const updatedTenant = prisma.memoryStore.tenants.get(tenantId);
    expect(updatedTenant.plan).toBe('growth');
    expect(updatedTenant.features.onlinePayments).toBe(true);
    expect(updatedTenant.features.hostel).toBe(true);
    expect(updatedTenant.features.library).toBe(true);
    expect(updatedTenant.features.inventory).toBe(true);
  });

  it('should process automated renewal invoices for expired subscription periods', async () => {
    // 1. Setup subscription that has reached period end
    const pastDate = new Date(Date.now() - 24 * 3600 * 1000); // yesterday
    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      tier: 'growth',
      planId: 'growth',
      billingCycle: 'MONTHLY',
      status: 'ACTIVE',
      currentPeriodEnd: pastDate,
      maxStudents: 1500,
      maxCampuses: 3,
      maxStaff: 100,
      storageLimitMb: 51200,
      messagingQuota: 5000,
    });

    // 2. Run automated renewal process
    const renewalResult = await lifecycleService.processAutomatedRenewals();
    expect(renewalResult.processedCount).toBe(1);
    expect(renewalResult.pastDueCount).toBe(1);

    // Verify a PENDING renewal invoice was generated
    const invoices = await billingService.getBillingInvoices(tenantId);
    const pendingInvoice = invoices.find((inv) => inv.status === 'PENDING');
    expect(pendingInvoice).toBeDefined();
    expect(pendingInvoice.amount).toBe(249); // Growth monthly
    expect(pendingInvoice.dueDate).toBeDefined();

    // 3. Pay the renewal invoice
    const payResult = await billingService.payBillingInvoice(tenantId, pendingInvoice.id, {
      paymentMethod: 'PAYSTACK',
      paymentReference: 'REF-PAYSTACK-99238',
    });

    expect(payResult.invoice.status).toBe('PAID');
    expect(payResult.subscription.status).toBe('ACTIVE');

    const sub = prisma.memoryStore.subscriptions.get(`sub_${tenantId}`);
    expect(sub.status).toBe('ACTIVE');
  });

  it('should support subscription cancellation while retaining access until period end', async () => {
    const periodEnd = new Date(Date.now() + 20 * 86400000);
    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      tier: 'starter',
      planId: 'starter',
      status: 'ACTIVE',
      currentPeriodEnd: periodEnd,
    });

    const cancelRes = await billingService.cancelSubscription(tenantId, {
      reason: 'School switching to annual contract next term',
    });

    expect(cancelRes.subscription.status).toBe('CANCELLED');
    const sub = prisma.memoryStore.subscriptions.get(`sub_${tenantId}`);
    expect(sub.status).toBe('CANCELLED');
  });
});
