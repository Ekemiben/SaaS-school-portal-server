import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service.js';
import { TenantLifecycleService } from '../src/modules/subscriptions/tenant-lifecycle.service.js';
import { SystemPermissions } from '../src/common/constants/permissions.js';

describe('Tenant Lifecycle Enforcement, Superadmin Overrides & Multi-Tenant Isolation', () => {
  let prisma: PrismaService;
  let subService: SubscriptionsService;
  let lifecycleService: TenantLifecycleService;

  const tenantA = 'tenant_greenfield_100';
  const tenantB = 'tenant_cedar_heights_200';

  beforeEach(() => {
    prisma = new PrismaService();
    subService = new SubscriptionsService(prisma);
    lifecycleService = new TenantLifecycleService(prisma, subService);

    prisma.memoryStore.tenants.set(tenantA, {
      id: tenantA,
      name: 'Greenfield Academy',
      status: 'ACTIVE',
      plan: 'free_trial',
    });

    prisma.memoryStore.tenants.set(tenantB, {
      id: tenantB,
      name: 'Cedar Heights High',
      status: 'ACTIVE',
      plan: 'starter',
    });
  });

  it('should suspend tenant when trial period expires', async () => {
    // 1. Expired trial setup for Tenant A
    const pastDate = new Date(Date.now() - 2 * 86400000);
    prisma.memoryStore.subscriptions.set(`sub_${tenantA}`, {
      id: `sub_${tenantA}`,
      tenantId: tenantA,
      tier: 'free_trial',
      planId: 'free_trial',
      status: 'TRIAL',
      trialEndsAt: pastDate,
      currentPeriodEnd: pastDate,
    });

    // 2. Enforce lifecycles
    const enforcement = await lifecycleService.enforceTenantLifecycles();
    expect(enforcement.enforcedCount).toBe(1);

    const suspendedTenant = prisma.memoryStore.tenants.get(tenantA);
    expect(suspendedTenant.status).toBe('SUSPENDED');

    // 3. Operations should be blocked for suspended tenant
    expect(() => lifecycleService.checkTenantOperationAllowed(tenantA)).toThrow(
      /is SUSPENDED due to an expired subscription/i,
    );
  });

  it('should suspend tenant when renewal invoices remain unpaid past grace period', async () => {
    // 1. Setup PAST_DUE subscription and overdue invoice (> 7 days)
    prisma.memoryStore.subscriptions.set(`sub_${tenantB}`, {
      id: `sub_${tenantB}`,
      tenantId: tenantB,
      tier: 'starter',
      planId: 'starter',
      status: 'PAST_DUE',
    });

    const overdueDueDate = new Date(Date.now() - 10 * 86400000);
    prisma.memoryStore.billingInvoices.set('binv_overdue_01', {
      id: 'binv_overdue_01',
      tenantId: tenantB,
      status: 'PENDING',
      dueDate: overdueDueDate,
    });

    // 2. Enforce lifecycles
    const enforcement = await lifecycleService.enforceTenantLifecycles();
    expect(enforcement.enforcedCount).toBe(1);

    const suspendedTenant = prisma.memoryStore.tenants.get(tenantB);
    expect(suspendedTenant.status).toBe('SUSPENDED');
  });

  it('should allow platform superadmin to override subscription limits and tenant status', async () => {
    // Custom grant for special educational partner
    const override = await subService.overrideSubscription(tenantA, {
      maxStudents: 50000,
      maxCampuses: 25,
      storageLimitMb: 500000,
      status: 'ACTIVE',
      notes: 'Ministry of Education pilot partnership override',
    });

    expect(override.maxStudents).toBe(50000);
    expect(override.maxCampuses).toBe(25);
    expect(override.storageLimitMb).toBe(500000);
    expect(override.status).toBe('ACTIVE');

    const tenant = prisma.memoryStore.tenants.get(tenantA);
    expect(tenant.status).toBe('ACTIVE');
  });

  it('should verify system permissions for billing and platform management', () => {
    expect(SystemPermissions.BILLING_VIEW).toBe('billing.view');
    expect(SystemPermissions.BILLING_MANAGE).toBe('billing.manage');
    expect(SystemPermissions.PLATFORM_ADMIN).toBe('platform.admin');
  });
});
