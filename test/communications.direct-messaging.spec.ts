import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { QueueService } from '../src/jobs/queue.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Phase 5 — Direct Messaging & Two-Way Communication Architecture', () => {
  let prisma: PrismaService;
  let queueService: QueueService;
  let notificationsService: NotificationsService;
  let commsService: CommunicationsService;

  let tenantAlpha: string;
  let tenantBeta: string;

  let teacherAlpha: string;
  let parentAlpha: string;
  let adminAlpha: string;

  let teacherBeta: string;
  let parentBeta: string;

  beforeEach(async () => {
    const timestamp = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    tenantAlpha = `tenant_dm_alpha_${timestamp}`;
    tenantBeta = `tenant_dm_beta_${timestamp}`;

    teacherAlpha = `usr_tch_alpha_${timestamp}`;
    parentAlpha = `usr_par_alpha_${timestamp}`;
    adminAlpha = `usr_adm_alpha_${timestamp}`;

    teacherBeta = `usr_tch_beta_${timestamp}`;
    parentBeta = `usr_par_beta_${timestamp}`;

    prisma = new PrismaService();
    await prisma.onModuleInit();

    queueService = new QueueService(prisma);
    notificationsService = new NotificationsService(prisma);
    commsService = new CommunicationsService(prisma, queueService, undefined, notificationsService);

    if (prisma.isDbConnected) {
      try {
        await prisma.tenant.createMany({
          data: [
            { id: tenantAlpha, name: 'Alpha Academy', slug: `alpha-${timestamp}` },
            { id: tenantBeta, name: 'Beta High', slug: `beta-${timestamp}` },
          ],
        });

        await prisma.user.createMany({
          data: [
            {
              id: teacherAlpha,
              tenantId: tenantAlpha,
              email: `teacher@alpha-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Tunde',
              lastName: 'Bakare',
            },
            {
              id: parentAlpha,
              tenantId: tenantAlpha,
              email: `parent@alpha-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Ngozi',
              lastName: 'Eze',
            },
            {
              id: adminAlpha,
              tenantId: tenantAlpha,
              email: `admin@alpha-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Bursar',
              lastName: 'Okoro',
            },
            {
              id: teacherBeta,
              tenantId: tenantBeta,
              email: `teacher@beta-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Fatima',
              lastName: 'Garba',
            },
            {
              id: parentBeta,
              tenantId: tenantBeta,
              email: `parent@beta-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Aliyu',
              lastName: 'Musa',
            },
          ],
        });
      } catch (err: any) {
        console.warn(`Test DB setup error: ${err.message}`);
      }
    }
  });

  afterEach(async () => {
    if (prisma.isDbConnected) {
      try {
        await prisma.communicationMessage.deleteMany({
          where: { thread: { tenantId: { in: [tenantAlpha, tenantBeta] } } },
        });
        await prisma.communicationThread.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.inAppInboxItem.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.user.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.tenant.deleteMany({
          where: { id: { in: [tenantAlpha, tenantBeta] } },
        });
      } catch (err: any) {
        console.warn(`Test DB teardown error: ${err.message}`);
      }
    }
    await prisma.$disconnect();
  });

  it('1. should create a direct conversation thread, exchange messages, and fan out inbox notifications', async () => {
    // 1. Teacher sends initial message to Parent
    const res1 = await commsService.sendDirectMessage(tenantAlpha, teacherAlpha, {
      recipientUserId: parentAlpha,
      subject: 'Academic Performance Update for Chinedu',
      content: 'Hello Mrs. Eze, I would like to discuss Chinedu mathematics progress.',
    });

    expect(res1.thread.id).toBeDefined();
    expect(res1.message.id).toBeDefined();
    expect(res1.message.content).toContain('Chinedu mathematics progress');

    const threadId = res1.thread.id;

    // 2. Verify InAppInboxItem was created for the Parent
    const parentInbox = await notificationsService.listUserInbox(tenantAlpha, parentAlpha);
    expect(parentInbox.items.length).toBeGreaterThanOrEqual(1);
    expect(parentInbox.items[0].title).toContain('Tunde Bakare');
    expect(parentInbox.items[0].message).toContain('Chinedu mathematics');

    // 3. Parent replies in the same thread
    const res2 = await commsService.sendDirectMessage(tenantAlpha, parentAlpha, {
      threadId,
      recipientUserId: teacherAlpha,
      content: 'Thank you Mr. Bakare. When would be a good time to meet?',
    });

    expect(res2.thread.id).toBe(threadId);
    expect(res2.message.senderId).toBe(parentAlpha);

    // 4. Verify Teacher received an in-app inbox notification for the reply
    const teacherInbox = await notificationsService.listUserInbox(tenantAlpha, teacherAlpha);
    expect(teacherInbox.items.length).toBeGreaterThanOrEqual(1);
    expect(teacherInbox.items[0].title).toContain('Ngozi Eze');
  });

  it('2. should calculate unread counts accurately and auto-mark messages as read upon thread access', async () => {
    // Teacher sends 2 messages in a thread
    const res1 = await commsService.sendDirectMessage(tenantAlpha, teacherAlpha, {
      recipientUserId: parentAlpha,
      subject: 'Excursion Permission Slip',
      content: 'Please find attached the permission slip for the science excursion.',
    });
    const threadId = res1.thread.id;

    await commsService.sendDirectMessage(tenantAlpha, teacherAlpha, {
      threadId,
      recipientUserId: parentAlpha,
      content: 'The deadline for return is this Friday.',
    });

    // Check Parent thread list: unreadCount should be 2
    const parentThreadsBefore = await commsService.getUserThreads(tenantAlpha, parentAlpha);
    expect(parentThreadsBefore.length).toBe(1);
    expect(parentThreadsBefore[0].unreadCount).toBe(2);
    expect(parentThreadsBefore[0].otherParticipant?.name).toContain('Tunde Bakare');

    // Check Teacher thread list: unreadCount should be 0 (teacher is sender)
    const teacherThreads = await commsService.getUserThreads(tenantAlpha, teacherAlpha);
    expect(teacherThreads[0].unreadCount).toBe(0);

    // Parent accesses thread messages -> auto-reads messages
    const threadDetails = await commsService.getThreadMessages(tenantAlpha, threadId, parentAlpha);
    expect(threadDetails.messages.length).toBe(2);
    expect(threadDetails.messages[0].content).toContain('science excursion');

    // Re-check Parent thread list: unreadCount should now be 0
    const parentThreadsAfter = await commsService.getUserThreads(tenantAlpha, parentAlpha);
    expect(parentThreadsAfter[0].unreadCount).toBe(0);
  });

  it('3. should support explicit markThreadAsRead operation', async () => {
    const res1 = await commsService.sendDirectMessage(tenantAlpha, teacherAlpha, {
      recipientUserId: parentAlpha,
      content: 'Reminder about homework submission.',
    });

    const threadId = res1.thread.id;

    const markRes = await commsService.markThreadAsRead(tenantAlpha, threadId, parentAlpha);
    expect(markRes.success).toBe(true);

    const parentThreads = await commsService.getUserThreads(tenantAlpha, parentAlpha);
    expect(parentThreads[0].unreadCount).toBe(0);
  });

  it('4. should enforce thread security and forbid unauthorized third-party access', async () => {
    // Teacher and Parent have a private thread
    const res = await commsService.sendDirectMessage(tenantAlpha, teacherAlpha, {
      recipientUserId: parentAlpha,
      content: 'Confidential student notes.',
    });
    const threadId = res.thread.id;

    // AdminAlpha (who is not a participant in this thread) attempts to view messages
    await expect(
      commsService.getThreadMessages(tenantAlpha, threadId, adminAlpha),
    ).rejects.toThrow(ForbiddenException);
  });

  it('5. should enforce strict multi-tenant isolation across direct messaging', async () => {
    // 1. Teacher from Tenant Alpha tries to message Parent in Tenant Beta -> Rejected
    await expect(
      commsService.sendDirectMessage(tenantAlpha, teacherAlpha, {
        recipientUserId: parentBeta,
        content: 'Cross tenant attempt.',
      }),
    ).rejects.toThrow(NotFoundException);

    // 2. Valid thread inside Tenant Alpha
    const alphaMsg = await commsService.sendDirectMessage(tenantAlpha, teacherAlpha, {
      recipientUserId: parentAlpha,
      content: 'Alpha school message.',
    });

    // 3. User from Tenant Beta tries to query Alpha thread
    await expect(
      commsService.getThreadMessages(tenantBeta, alphaMsg.thread.id, teacherBeta),
    ).rejects.toThrow(NotFoundException);

    // 4. User from Tenant Beta queries their thread list -> sees 0 Alpha threads
    const betaThreads = await commsService.getUserThreads(tenantBeta, teacherBeta);
    expect(betaThreads.length).toBe(0);
  });
});
