import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service.js';
import { UsageMeteringService } from '../src/modules/subscriptions/usage-metering.service.js';

describe('Subscriptions, Multi-Tier Plans & Usage Metering Engine', () => {
  let prisma: PrismaService;
  let subService: SubscriptionsService;
  let meteringService: UsageMeteringService;

  const tenantId = 'tenant_meter_test_100';

  beforeEach(() => {
    prisma = new PrismaService();
    subService = new SubscriptionsService(prisma);
    meteringService = new UsageMeteringService(prisma, subService);

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Meter Test School',
      status: 'ACTIVE',
      plan: 'starter',
    });
  });

  it('should expose multi-tier SaaS plan definitions and features', () => {
    const plans = subService.getAvailablePlans();
    expect(plans.length).toBe(4);

    const tiers = plans.map((p) => p.tier);
    expect(tiers).toContain('free_trial');
    expect(tiers).toContain('starter');
    expect(tiers).toContain('growth');
    expect(tiers).toContain('enterprise');

    const starter = plans.find((p) => p.tier === 'starter')!;
    expect(starter.maxStudents).toBe(300);
    expect(starter.maxCampuses).toBe(1);
    expect(starter.monthlyPrice).toBe(99);

    const growth = plans.find((p) => p.tier === 'growth')!;
    expect(growth.maxStudents).toBe(1500);
    expect(growth.maxCampuses).toBe(3);
    expect(growth.features).toContain('onlinePayments');
    expect(growth.features).toContain('inventory');

    const enterprise = plans.find((p) => p.tier === 'enterprise')!;
    expect(enterprise.maxStudents).toBe(10000);
    expect(enterprise.maxCampuses).toBe(10);
    expect(enterprise.features).toContain('customDomain');
    expect(enterprise.features).toContain('audit');
  });

  it('should calculate accurate real-time usage metrics across all resources', async () => {
    // 1. Setup subscription with Starter limits
    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      tier: 'starter',
      status: 'ACTIVE',
      maxStudents: 100,
      maxCampuses: 2,
      maxStaff: 10,
      storageLimitMb: 1000,
      messagingQuota: 500,
    });

    // 2. Add test entities
    prisma.memoryStore.students.set('std_1', { id: 'std_1', tenantId, status: 'ACTIVE' });
    prisma.memoryStore.students.set('std_2', { id: 'std_2', tenantId, status: 'ACTIVE' });
    prisma.memoryStore.campuses.set('camp_1', { id: 'camp_1', tenantId });
    prisma.memoryStore.teachers.set('tch_1', { id: 'tch_1', tenantId });
    prisma.memoryStore.fileAssets.set('file_1', { id: 'file_1', tenantId, size: 50 * 1024 * 1024 }); // 50MB
    prisma.memoryStore.notifications.set('notif_1', { id: 'notif_1', tenantId, channel: 'SMS' });

    const usage = await meteringService.getTenantUsage(tenantId);
    expect(usage.metrics.students.used).toBe(2);
    expect(usage.metrics.students.limit).toBe(100);
    expect(usage.metrics.students.remaining).toBe(98);
    expect(usage.metrics.students.isExceeded).toBe(false);

    expect(usage.metrics.campuses.used).toBe(1);
    expect(usage.metrics.campuses.limit).toBe(2);

    expect(usage.metrics.staff.used).toBe(1);
    expect(usage.metrics.staff.limit).toBe(10);

    expect(usage.metrics.storageMb.used).toBe(50);
    expect(usage.metrics.storageMb.limit).toBe(1000);

    expect(usage.metrics.messagingSms.used).toBe(1);
    expect(usage.metrics.messagingSms.limit).toBe(500);
  });

  it('should enforce quota limits and throw exceptions when exceeded', async () => {
    // Setup restrictive limits
    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      tier: 'starter',
      status: 'ACTIVE',
      maxStudents: 2,
      maxCampuses: 1,
      maxStaff: 1,
      storageLimitMb: 10,
      messagingQuota: 2,
    });

    // Populate to limit
    prisma.memoryStore.students.set('std_1', { id: 'std_1', tenantId, status: 'ACTIVE' });
    prisma.memoryStore.students.set('std_2', { id: 'std_2', tenantId, status: 'ACTIVE' });
    prisma.memoryStore.campuses.set('camp_1', { id: 'camp_1', tenantId });
    prisma.memoryStore.teachers.set('tch_1', { id: 'tch_1', tenantId });
    prisma.memoryStore.fileAssets.set('file_1', { id: 'file_1', tenantId, size: 10 * 1024 * 1024 }); // 10MB
    prisma.memoryStore.notifications.set('notif_1', { id: 'notif_1', tenantId, channel: 'SMS' });
    prisma.memoryStore.notifications.set('notif_2', { id: 'notif_2', tenantId, channel: 'SMS' });

    // Student quota enforcement
    await expect(meteringService.enforceStudentQuota(tenantId, 1)).rejects.toThrow(/student quota exceeded/i);

    // Campus quota enforcement
    await expect(meteringService.enforceCampusQuota(tenantId, 1)).rejects.toThrow(/campus quota exceeded/i);

    // Staff quota enforcement
    await expect(meteringService.enforceStaffQuota(tenantId, 1)).rejects.toThrow(/staff quota exceeded/i);

    // Storage quota enforcement
    await expect(meteringService.enforceStorageQuota(tenantId, 5 * 1024 * 1024)).rejects.toThrow(/storage quota exceeded/i);

    // Messaging quota enforcement
    await expect(meteringService.enforceMessagingQuota(tenantId, 1)).rejects.toThrow(/sms messaging quota exhausted/i);
  });
});
