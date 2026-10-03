import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { ParentsService } from '../src/modules/parents/parents.service.js';
import { ClinicService } from '../src/modules/medical/services/clinic.service.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { AudienceService } from '../src/modules/communications/services/audience.service.js';
import { NotificationProcessor } from '../src/jobs/processors/notification.processor.js';
import { EmailAdapter } from '../src/modules/notifications/adapters/email.adapter.js';
import { SmsAdapter } from '../src/modules/notifications/adapters/sms.adapter.js';
import { WhatsAppAdapter } from '../src/modules/notifications/adapters/whatsapp.adapter.js';

describe('COMPREHENSIVE AUDIT & VERIFICATION — Steps 1 to 6 End-to-End', () => {
  let prisma: PrismaService;
  let parentsService: ParentsService;
  let clinicService: ClinicService;
  let commsService: CommunicationsService;
  let notificationsService: NotificationsService;
  let audienceService: AudienceService;

  const tenantAlpha = 'tenant_audit_alpha';
  const tenantBeta = 'tenant_audit_beta';

  const userAdminAlpha = 'usr_admin_alpha_01';
  const userTeacherAlpha = 'usr_tch_alpha_01';
  const userParentAlpha1 = 'usr_parent_alpha_01';
  const userParentAlpha2 = 'usr_parent_alpha_02';
  const userParentBeta1 = 'usr_parent_beta_01';

  const studentAlpha1 = 'std_alpha_001';
  const studentAlpha2 = 'std_alpha_002';
  const studentBeta1 = 'std_beta_001';

  const classAlpha1 = 'cls_alpha_primary_1';
  const teacherAlpha1 = 'tch_alpha_01';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    parentsService = new ParentsService(prisma);
    clinicService = new ClinicService(prisma);
    audienceService = new AudienceService(prisma);
    notificationsService = new NotificationsService(prisma);

    const emailAdapter = new EmailAdapter();
    const smsAdapter = new SmsAdapter();
    const whatsAppAdapter = new WhatsAppAdapter();
    const notifProcessor = new NotificationProcessor(emailAdapter, smsAdapter, whatsAppAdapter);
    commsService = new CommunicationsService(prisma, audienceService as any, notifProcessor as any, notificationsService);

    // Setup Mock Database & Memory Store for Tenant Alpha
    prisma.memoryStore.tenants.set(tenantAlpha, { id: tenantAlpha, name: 'Alpha Grammar School' });
    prisma.memoryStore.tenants.set(tenantBeta, { id: tenantBeta, name: 'Beta Academy' });

    // Users
    prisma.memoryStore.users.set(userAdminAlpha, {
      id: userAdminAlpha,
      tenantId: tenantAlpha,
      email: 'admin@alphaschool.edu.ng',
      role: 'ADMIN',
      firstName: 'Principal',
      lastName: 'Adebayo',
    });

    prisma.memoryStore.users.set(userTeacherAlpha, {
      id: userTeacherAlpha,
      tenantId: tenantAlpha,
      email: 'teacher@alphaschool.edu.ng',
      role: 'TEACHER',
      firstName: 'Mr. Emmanuel',
      lastName: 'Okafor',
    });

    prisma.memoryStore.users.set(userParentAlpha1, {
      id: userParentAlpha1,
      tenantId: tenantAlpha,
      email: 'parent1@gmail.com',
      role: 'PARENT',
      firstName: 'Mrs. Folake',
      lastName: 'Adeleke',
    });

    prisma.memoryStore.users.set(userParentAlpha2, {
      id: userParentAlpha2,
      tenantId: tenantAlpha,
      email: 'parent2@gmail.com',
      role: 'PARENT',
      firstName: 'Mr. Chukwuma',
      lastName: 'Nnamdi',
    });

    prisma.memoryStore.users.set(userParentBeta1, {
      id: userParentBeta1,
      tenantId: tenantBeta,
      email: 'parent_beta@gmail.com',
      role: 'PARENT',
      firstName: 'Mrs. Fatima',
      lastName: 'Bello',
    });

    // Teachers
    prisma.memoryStore.teachers.set(teacherAlpha1, {
      id: teacherAlpha1,
      tenantId: tenantAlpha,
      userId: userTeacherAlpha,
      firstName: 'Emmanuel',
      lastName: 'Okafor',
      email: 'teacher@alphaschool.edu.ng',
    });

    // Classes
    prisma.memoryStore.classes.set(classAlpha1, {
      id: classAlpha1,
      tenantId: tenantAlpha,
      name: 'Primary 5 Gold',
      classTeacherId: teacherAlpha1,
    });

    // Students
    prisma.memoryStore.students.set(studentAlpha1, {
      id: studentAlpha1,
      tenantId: tenantAlpha,
      admissionNumber: 'SCH/2026/001',
      firstName: 'Tobi',
      lastName: 'Adeleke',
      classId: classAlpha1,
      assignedClass: 'Primary 5 Gold',
    });

    prisma.memoryStore.students.set(studentAlpha2, {
      id: studentAlpha2,
      tenantId: tenantAlpha,
      admissionNumber: 'SCH/2026/002',
      firstName: 'Chioma',
      lastName: 'Nnamdi',
      classId: classAlpha1,
      assignedClass: 'Primary 5 Gold',
    });

    prisma.memoryStore.students.set(studentBeta1, {
      id: studentBeta1,
      tenantId: tenantBeta,
      admissionNumber: 'BETA/2026/001',
      firstName: 'Zainab',
      lastName: 'Bello',
      classId: 'cls_beta_1',
      assignedClass: 'JSS 1 Blue',
    });

    // Parents
    prisma.memoryStore.parents.set('prt_alpha_01', {
      id: 'prt_alpha_01',
      tenantId: tenantAlpha,
      userId: userParentAlpha1,
      firstName: 'Folake',
      lastName: 'Adeleke',
      email: 'parent1@gmail.com',
      phone: '+2348011112222',
      studentIds: [studentAlpha1],
    });

    prisma.memoryStore.parents.set('prt_alpha_02', {
      id: 'prt_alpha_02',
      tenantId: tenantAlpha,
      userId: userParentAlpha2,
      firstName: 'Chukwuma',
      lastName: 'Nnamdi',
      email: 'parent2@gmail.com',
      phone: '+2348033334444',
      studentIds: [studentAlpha2],
    });

    prisma.memoryStore.parents.set('prt_beta_01', {
      id: 'prt_beta_01',
      tenantId: tenantBeta,
      userId: userParentBeta1,
      firstName: 'Fatima',
      lastName: 'Bello',
      email: 'parent_beta@gmail.com',
      phone: '+2348099998888',
      studentIds: [studentBeta1],
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  // ==========================================
  // SCENARIO 1: Parent -> Admin Communication
  // ==========================================
  it('1. Parent -> Admin: Parent sends message to Admin, Admin receives thread and in-app notification', async () => {
    // 1. Parent initiates thread with ADMIN recipient
    const thread = await parentsService.createParentThread(tenantAlpha, userParentAlpha1, {
      recipientType: 'ADMIN',
      studentId: studentAlpha1,
      subject: 'Tuition Fee Structure Inquiry',
      message: 'Good morning Admin, I would like to inquire about installment payment options.',
    });

    expect(thread.id).toBeDefined();
    expect(thread.subject).toBe('Tuition Fee Structure Inquiry');
    expect(thread.createdById).toBe(userParentAlpha1);
    expect(thread.participantIds).toContain(userParentAlpha1);
    expect(thread.participantIds).toContain(userAdminAlpha);

    // 2. Verify Admin inbox received InAppInboxItem notification
    const adminInboxRes = await notificationsService.listUserInbox(tenantAlpha, userAdminAlpha);
    const adminInbox = adminInboxRes.items;
    const notif = adminInbox.find((n: any) => n.title.includes('New Parent Message') || n.title.includes('Tuition Fee'));
    expect(notif).toBeDefined();
    expect(notif.recipientUserId).toBe(userAdminAlpha);
    expect(notif.message).toContain('installment payment options');

    // 3. Verify Admin can list their active conversation threads
    const adminThreads = await commsService.getUserThreads(tenantAlpha, userAdminAlpha);
    const matchedThread = adminThreads.find((t: any) => t.id === thread.id);
    expect(matchedThread).toBeDefined();
    expect(matchedThread.subject).toBe('Tuition Fee Structure Inquiry');

    // 4. Admin reads thread messages
    const threadMessages = await commsService.getThreadMessages(tenantAlpha, thread.id, userAdminAlpha);
    expect(threadMessages.messages.length).toBeGreaterThanOrEqual(1);
    expect(threadMessages.messages[0].content).toContain('installment payment options');

    // 5. Admin sends a direct reply
    const reply = await commsService.sendDirectMessage(tenantAlpha, userAdminAlpha, {
      threadId: thread.id,
      content: 'Dear Mrs. Adeleke, installment payments are supported in 2 tranches. Bursary has been notified.',
    });
    expect(reply.message?.id || reply.id).toBeDefined();

    // 6. Parent views the thread and sees Admin reply
    const parentThreads = await parentsService.getParentThreads(tenantAlpha, userParentAlpha1);
    const parentActiveThread = parentThreads.find((t: any) => t.id === thread.id);
    expect(parentActiveThread).toBeDefined();
    expect(parentActiveThread.messages.some((m: any) => m.content.includes('2 tranches'))).toBe(true);
  });

  // ==========================================
  // SCENARIO 2: Parent -> Teacher Communication
  // ==========================================
  it('2. Parent -> Class Teacher: Resolves assigned class teacher and delivers thread and notification', async () => {
    // 1. Parent initiates thread with CLASS_TEACHER recipient for Tobi (Primary 5 Gold)
    const thread = await parentsService.createParentThread(tenantAlpha, userParentAlpha1, {
      recipientType: 'CLASS_TEACHER',
      studentId: studentAlpha1,
      subject: 'Science Project Timeline',
      message: 'Hello Mr. Okafor, when is Tobi required to submit the solar system model?',
    });

    expect(thread.id).toBeDefined();
    expect(thread.participantIds).toContain(userParentAlpha1);
    expect(thread.participantIds).toContain(userTeacherAlpha);

    // 2. Verify Teacher receives InAppInboxItem notification
    const teacherInboxRes = await notificationsService.listUserInbox(tenantAlpha, userTeacherAlpha);
    const teacherInbox = teacherInboxRes.items;
    const notif = teacherInbox.find((n: any) => n.title.includes('Science Project Timeline') || n.message.includes('solar system'));
    expect(notif).toBeDefined();
    expect(notif.recipientUserId).toBe(userTeacherAlpha);

    // 3. Teacher reads thread and replies
    const reply = await commsService.sendDirectMessage(tenantAlpha, userTeacherAlpha, {
      threadId: thread.id,
      content: 'The solar system model is due next Thursday. Thank you.',
    });
    expect(reply.message?.id || reply.id).toBeDefined();

    // 4. Verify Parent inbox receives reply notification
    const parentInboxRes = await notificationsService.listUserInbox(tenantAlpha, userParentAlpha1);
    const parentInbox = parentInboxRes.items;
    const parentNotif = parentInbox.find((n: any) => n.message.includes('due next Thursday'));
    expect(parentNotif).toBeDefined();
    expect(parentNotif.recipientUserId).toBe(userParentAlpha1);
  });

  // ==========================================
  // SCENARIO 3: School Clinic Intake Notification
  // ==========================================
  it('3. School Clinic Intake: Recording student clinic visit generates instant High Priority notification to parent', async () => {
    // 1. Clinic records visit for Tobi Adeleke
    const visit = await clinicService.recordClinicVisit(tenantAlpha, {
      patientId: studentAlpha1,
      student: 'Tobi Adeleke',
      studentId: 'SCH/2026/001',
      chiefComplaint: 'Stomach cramp after lunch',
      diagnosis: 'Mild indigestion. Administered oral rehydration solution.',
      parentNotified: true,
      attendedBy: 'Nurse Clara (RN)',
    } as any);

    expect(visit.id).toBeDefined();

    // 2. Verify Parent of Tobi (Mrs. Folake Adeleke) receives InAppInboxItem
    const parent1InboxRes = await notificationsService.listUserInbox(tenantAlpha, userParentAlpha1);
    const parent1Inbox = parent1InboxRes.items;
    const clinicNotif = parent1Inbox.find((n: any) => n.category === 'HEALTH_UPDATE' || n.title.includes('School Clinic Visit'));

    expect(clinicNotif).toBeDefined();
    expect(clinicNotif.recipientUserId).toBe(userParentAlpha1);
    expect(clinicNotif.priority).toBe('HIGH');
    expect(clinicNotif.actionUrl).toBe('/parent');
    expect(clinicNotif.message).toContain('Tobi Adeleke visited the clinic today');
    expect(clinicNotif.message).toContain('Stomach cramp after lunch');
    expect(clinicNotif.message).toContain('Nurse Clara (RN)');

    // 3. Privacy Check: Ensure Parent 2 (Mr. Chukwuma Nnamdi) did NOT receive Tobi clinic notification
    const parent2InboxRes = await notificationsService.listUserInbox(tenantAlpha, userParentAlpha2);
    const parent2Inbox = parent2InboxRes.items;
    const leakedNotif = parent2Inbox.find((n: any) => n.message?.includes('Tobi Adeleke'));
    expect(leakedNotif).toBeUndefined();
  });

  // ==========================================
  // SCENARIO 4: Multi-Tenant Isolation
  // ==========================================
  it('4. Multi-Tenant Isolation: Tenant Beta parent cannot see Tenant Alpha messages or notifications', async () => {
    // 1. Tenant Beta parent checks inbox
    const betaInboxRes = await notificationsService.listUserInbox(tenantBeta, userParentBeta1);
    const betaInbox = betaInboxRes.items;
    const alphaLeak = betaInbox.find(
      (n: any) => n.message?.includes('Adeleke') || n.message?.includes('solar system') || n.message?.includes('Tuition Fee'),
    );
    expect(alphaLeak).toBeUndefined();

    // 2. Tenant Beta parent checks threads
    const betaThreads = await parentsService.getParentThreads(tenantBeta, userParentBeta1);
    expect(betaThreads.length).toBe(0);
  });
});
