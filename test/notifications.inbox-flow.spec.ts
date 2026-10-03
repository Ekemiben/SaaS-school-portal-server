import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueueService } from '../src/jobs/queue.service.js';
import { OutboxService } from '../src/infrastructure/outbox/outbox.service.js';
import { randomUUID } from 'crypto';

describe('Phase 2 — Notification & In-App Inbox Architecture', () => {
  let prisma: PrismaService;
  let notificationsService: NotificationsService;
  let communicationsService: CommunicationsService;
  let queueService: QueueService;
  let outboxService: OutboxService;

  let tenantAlpha: string;
  let tenantBeta: string;
  let userAlpha1: string;
  let userAlpha2: string;
  let userBeta1: string;

  beforeEach(async () => {
    const timestamp = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    tenantAlpha = `tenant_notif_alpha_${timestamp}`;
    tenantBeta = `tenant_notif_beta_${timestamp}`;
    userAlpha1 = `usr_alpha1_${timestamp}`;
    userAlpha2 = `usr_alpha2_${timestamp}`;
    userBeta1 = `usr_beta1_${timestamp}`;

    prisma = new PrismaService();
    await prisma.onModuleInit();

    queueService = {
      addJob: async () => 'mock-job-id',
    } as any;

    outboxService = {
      recordEvent: async () => ({ id: 'outbox-1' }),
    } as any;

    notificationsService = new NotificationsService(prisma);
    communicationsService = new CommunicationsService(
      prisma,
      queueService,
      outboxService,
      notificationsService,
    );

    // Seed test tenants and users in database if connected
    if (prisma.isDbConnected) {
      try {
        await prisma.tenant.createMany({
          data: [
            { id: tenantAlpha, name: 'Alpha Academy', slug: `alpha-${Date.now()}` },
            { id: tenantBeta, name: 'Beta High', slug: `beta-${Date.now()}` },
          ],
        });

        await prisma.user.createMany({
          data: [
            {
              id: userAlpha1,
              tenantId: tenantAlpha,
              email: `parent1@alpha-${Date.now()}.com`,
              passwordHash: 'hash',
              firstName: 'John',
              lastName: 'Doe',
            },
            {
              id: userAlpha2,
              tenantId: tenantAlpha,
              email: `teacher1@alpha-${Date.now()}.com`,
              passwordHash: 'hash',
              firstName: 'Jane',
              lastName: 'Smith',
            },
            {
              id: userBeta1,
              tenantId: tenantBeta,
              email: `parent1@beta-${Date.now()}.com`,
              passwordHash: 'hash',
              firstName: 'Bob',
              lastName: 'Brown',
            },
          ],
        });

        await prisma.parent.create({
          data: {
            id: `par_alpha1_${Date.now()}`,
            tenantId: tenantAlpha,
            userId: userAlpha1,
            firstName: 'John',
            lastName: 'Doe',
            email: `parent1@alpha-${Date.now()}.com`,
            phone: '+2348011112222',
          },
        });
      } catch {
        // Fallback store
      }
    } else {
      prisma.memoryStore.users.set(userAlpha1, {
        id: userAlpha1,
        tenantId: tenantAlpha,
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
      });
      prisma.memoryStore.users.set(userAlpha2, {
        id: userAlpha2,
        tenantId: tenantAlpha,
        firstName: 'Jane',
        lastName: 'Smith',
        isActive: true,
      });
      prisma.memoryStore.users.set(userBeta1, {
        id: userBeta1,
        tenantId: tenantBeta,
        firstName: 'Bob',
        lastName: 'Brown',
        isActive: true,
      });
    }
  });

  afterEach(async () => {
    if (prisma.isDbConnected) {
      try {
        await prisma.inAppInboxItem.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.notification.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.parent.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.user.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.tenant.deleteMany({
          where: { id: { in: [tenantAlpha, tenantBeta] } },
        });
      } catch {
        // Ignore cleanup errors
      }
    }
    await prisma.onModuleDestroy();
  });

  it('1. Persistent Inbox Item Creation & Delivery', async () => {
    const item = await notificationsService.createInboxItem(tenantAlpha, {
      recipientUserId: userAlpha1,
      title: 'Tuition Fee Due',
      message: 'Please pay first term tuition before Friday.',
      category: 'FEE_REMINDER',
      priority: 'HIGH',
      actionUrl: '/finance/invoices/inv-01',
    });

    expect(item).toBeDefined();
    expect(item.id).toMatch(/^inbox_/);
    expect(item.recipientUserId).toBe(userAlpha1);
    expect(item.tenantId).toBe(tenantAlpha);
    expect(item.isRead).toBe(false);
    expect(item.readAt).toBeNull();
    expect(item.category).toBe('FEE_REMINDER');
    expect(item.priority).toBe('HIGH');
  });

  it('2. Unread Count & Mark as Read Lifecycle', async () => {
    const item1 = await notificationsService.createInboxItem(tenantAlpha, {
      recipientUserId: userAlpha1,
      title: 'Notice 1',
      message: 'First notice',
    });
    const item2 = await notificationsService.createInboxItem(tenantAlpha, {
      recipientUserId: userAlpha1,
      title: 'Notice 2',
      message: 'Second notice',
    });

    let unread = await notificationsService.getUnreadCount(tenantAlpha, userAlpha1);
    expect(unread).toBe(2);

    const updated = await notificationsService.markAsRead(tenantAlpha, userAlpha1, item1.id);
    expect(updated?.isRead).toBe(true);
    expect(updated?.readAt).toBeInstanceOf(Date);

    unread = await notificationsService.getUnreadCount(tenantAlpha, userAlpha1);
    expect(unread).toBe(1);

    const inbox = await notificationsService.listUserInbox(tenantAlpha, userAlpha1, { isRead: false });
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0].id).toBe(item2.id);
  });

  it('3. Mark All as Read Operation', async () => {
    await notificationsService.createInboxItem(tenantAlpha, {
      recipientUserId: userAlpha1,
      title: 'Notice A',
      message: 'Message A',
    });
    await notificationsService.createInboxItem(tenantAlpha, {
      recipientUserId: userAlpha1,
      title: 'Notice B',
      message: 'Message B',
    });
    await notificationsService.createInboxItem(tenantAlpha, {
      recipientUserId: userAlpha1,
      title: 'Notice C',
      message: 'Message C',
    });

    let unread = await notificationsService.getUnreadCount(tenantAlpha, userAlpha1);
    expect(unread).toBe(3);

    const res = await notificationsService.markAllAsRead(tenantAlpha, userAlpha1);
    expect(res.count).toBe(3);

    unread = await notificationsService.getUnreadCount(tenantAlpha, userAlpha1);
    expect(unread).toBe(0);
  });

  it('4. Full End-to-End Announcement -> Fan-Out -> Parent Inbox Reading Journey', async () => {
    // Admin creates announcement targeted at Parents
    const announcement = await communicationsService.createAnnouncement(
      tenantAlpha,
      userAlpha2, // staff author
      {
        title: 'PTA Meeting on Saturday',
        content: 'All parents are invited to the PTA General Assembly.',
        audience: 'PARENTS',
        channel: 'In-App Notice',
      } as any,
    );

    expect(announcement).toBeDefined();
    expect(announcement.title).toBe('PTA Meeting on Saturday');

    // Parent logs in and checks personal inbox
    const parentInbox = await notificationsService.listUserInbox(tenantAlpha, userAlpha1);
    expect(parentInbox.items.length).toBeGreaterThanOrEqual(1);

    const receivedItem = parentInbox.items.find((i) => i.title === 'PTA Meeting on Saturday');
    expect(receivedItem).toBeDefined();
    expect(receivedItem?.isRead).toBe(false);

    // Parent marks notification as read
    const readItem = await notificationsService.markAsRead(tenantAlpha, userAlpha1, receivedItem!.id);
    expect(readItem?.isRead).toBe(true);
    expect(readItem?.readAt).toBeDefined();

    // Verify unread count becomes 0
    const unread = await notificationsService.getUnreadCount(tenantAlpha, userAlpha1);
    expect(unread).toBe(0);
  });

  it('5. Tenant & User Security Isolation', async () => {
    const alphaItem = await notificationsService.createInboxItem(tenantAlpha, {
      recipientUserId: userAlpha1,
      title: 'Alpha Private Notification',
      message: 'Confidential alpha data',
    });

    // Tenant Beta user cannot mark Tenant Alpha notification as read
    await expect(
      notificationsService.markAsRead(tenantBeta, userBeta1, alphaItem.id),
    ).rejects.toThrow();

    // User Alpha 2 cannot mark User Alpha 1 notification as read
    await expect(
      notificationsService.markAsRead(tenantAlpha, userAlpha2, alphaItem.id),
    ).rejects.toThrow();

    // Tenant Beta cannot see Tenant Alpha inbox items
    const betaInbox = await notificationsService.listUserInbox(tenantBeta, userBeta1);
    expect(betaInbox.items.find((i) => i.id === alphaItem.id)).toBeUndefined();
  });
});
