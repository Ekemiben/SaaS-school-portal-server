import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { DebtRecoveryService } from '../src/modules/fees/services/debt-recovery.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { MessageTemplateService } from '../src/modules/communications/services/message-template.service.js';
import { CommunicationPolicyService } from '../src/modules/communications/services/communication-policy.service.js';
import { CommunicationWalletService } from '../src/modules/communications/services/communication-wallet.service.js';
import {
  AgingBucket,
  ReminderChannel,
  ReminderLevel,
} from '../src/modules/fees/dto/debt-recovery.dto.js';
import { CampaignChannel } from '../src/modules/communications/dto/campaign.dto.js';

describe('Phase 9 — Automated Fee Reminders & Debt Recovery Communications', () => {
  let prisma: PrismaService;
  let queueServiceMock: any;
  let notificationsService: NotificationsService;
  let templateService: MessageTemplateService;
  let policyService: CommunicationPolicyService;
  let walletService: CommunicationWalletService;
  let debtRecoveryService: DebtRecoveryService;

  const tenantA = 'tenant_fee_alpha';
  const tenantB = 'tenant_fee_beta';
  const campusA = 'campus_fee_a';
  const classA = 'cls_fee_ss1';

  const parent1 = 'prt_fee_01';
  const parent1User = 'usr_parent_01';
  const parent2 = 'prt_fee_02';
  const parent2User = 'usr_parent_02';

  const student1 = 'std_fee_01';
  const student2 = 'std_fee_02';
  const student3 = 'std_fee_03';

  const invoice1 = 'inv_fee_01';
  const invoice2 = 'inv_fee_02';
  const invoice3 = 'inv_fee_03';

  const refDate = new Date('2026-10-31T00:00:00.000Z');

  beforeEach(async () => {
    prisma = new PrismaService();
    prisma.memoryStore.invoices.clear();
    prisma.memoryStore.students.clear();
    prisma.memoryStore.parents.clear();
    prisma.memoryStore.classes.clear();
    prisma.memoryStore.inboxItems.clear();
    prisma.memoryStore.messageTemplates.clear();
    prisma.memoryStore.communicationSettings.clear();
    prisma.memoryStore.communicationWallets.clear();
    prisma.memoryStore.communicationWalletTransactions.clear();

    queueServiceMock = {
      dispatch: vi.fn().mockResolvedValue('job-mock-id'),
    };

    notificationsService = new NotificationsService(prisma);
    templateService = new MessageTemplateService(prisma);
    policyService = new CommunicationPolicyService(prisma);
    walletService = new CommunicationWalletService(prisma);

    debtRecoveryService = new DebtRecoveryService(
      prisma,
      queueServiceMock,
      notificationsService,
      templateService,
      policyService,
      walletService,
    );

    // Setup Tenant A Entities
    prisma.memoryStore.tenants.set(tenantA, { id: tenantA, name: 'King\'s College Lagos', currency: 'NGN' });
    prisma.memoryStore.campuses.set(campusA, { id: campusA, tenantId: tenantA, name: 'Lagos Main Campus' });
    prisma.memoryStore.classes.set(classA, { id: classA, tenantId: tenantA, name: 'SS 1 Gold' });

    // Setup Parents
    prisma.memoryStore.parents.set(parent1, {
      id: parent1,
      tenantId: tenantA,
      userId: parent1User,
      firstName: 'Babatunde',
      lastName: 'Fashola',
      phone: '+2348022223333',
      email: 'babatunde@example.com',
    });

    prisma.memoryStore.parents.set(parent2, {
      id: parent2,
      tenantId: tenantA,
      userId: parent2User,
      firstName: 'Ngozi',
      lastName: 'Okonjo',
      phone: '+2348099998888',
      email: 'ngozi@example.com',
    });

    // Setup Students
    prisma.memoryStore.students.set(student1, {
      id: student1,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classA,
      firstName: 'Demola',
      lastName: 'Fashola',
      admissionNumber: 'KC/2026/001',
    });

    prisma.memoryStore.students.set(student2, {
      id: student2,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classA,
      firstName: 'Chidi',
      lastName: 'Okonjo',
      admissionNumber: 'KC/2026/002',
    });

    prisma.memoryStore.students.set(student3, {
      id: student3,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classA,
      firstName: 'Titi',
      lastName: 'Fashola',
      admissionNumber: 'KC/2026/003',
    });

    // Map parent-student relations
    const memory = prisma.memoryStore as any;
    memory.studentParents = new Map();
    memory.studentParents.set('sp_fee_1', { studentId: student1, parentId: parent1 });
    memory.studentParents.set('sp_fee_2', { studentId: student2, parentId: parent2 });
    memory.studentParents.set('sp_fee_3', { studentId: student3, parentId: parent1 });

    // Setup Invoices
    // 15 days overdue -> CURRENT bucket (16 Oct 2026 relative to 31 Oct 2026)
    prisma.memoryStore.invoices.set(invoice1, {
      id: invoice1,
      tenantId: tenantA,
      studentId: student1,
      classId: classA,
      invoiceNumber: 'INV-2026-FEE1',
      totalAmount: 180000,
      paidAmount: 60000,
      balanceAmount: 120000,
      currency: 'NGN',
      status: 'PARTIALLY_PAID',
      dueDate: new Date('2026-10-16T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      reminderCount: 0,
      lastReminderSentAt: null,
    });

    // 45 days overdue -> DAYS_31_60 bucket (16 Sep 2026 relative to 31 Oct 2026)
    prisma.memoryStore.invoices.set(invoice2, {
      id: invoice2,
      tenantId: tenantA,
      studentId: student2,
      classId: classA,
      invoiceNumber: 'INV-2026-FEE2',
      totalAmount: 250000,
      paidAmount: 0,
      balanceAmount: 250000,
      currency: 'NGN',
      status: 'PENDING',
      dueDate: new Date('2026-09-16T00:00:00.000Z'),
      createdAt: new Date('2026-08-15T00:00:00.000Z'),
      reminderCount: 1,
      lastReminderSentAt: new Date('2026-09-20T00:00:00.000Z'),
    });

    // Fully paid invoice (should NOT be detected as defaulter)
    prisma.memoryStore.invoices.set(invoice3, {
      id: invoice3,
      tenantId: tenantA,
      studentId: student3,
      classId: classA,
      invoiceNumber: 'INV-2026-FEE3',
      totalAmount: 150000,
      paidAmount: 150000,
      balanceAmount: 0,
      currency: 'NGN',
      status: 'PAID',
      dueDate: new Date('2026-10-10T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      reminderCount: 0,
    });

    // Setup Communication Wallet for Tenant A
    await walletService.creditWallet(
      tenantA,
      10000,
      'PAY_FEE_TEST_TOPUP',
      'Test Wallet Funding for Fee Reminders',
    );
  });

  it('1. discovers fee defaulters and categorizes aging buckets accurately', async () => {
    const defaulters = await debtRecoveryService.getDefaulters(tenantA, {}, refDate);

    expect(defaulters).toHaveLength(2);
    // Sorted by debt amount descending: invoice2 (250,000) then invoice1 (120,000)
    expect(defaulters[0].invoiceId).toBe(invoice2);
    expect(defaulters[0].balanceAmount).toBe(250000);
    expect(defaulters[0].daysOverdue).toBe(45);
    expect(defaulters[0].agingBucket).toBe(AgingBucket.DAYS_31_60);
    expect(defaulters[0].parent?.name).toBe('Ngozi Okonjo');

    expect(defaulters[1].invoiceId).toBe(invoice1);
    expect(defaulters[1].balanceAmount).toBe(120000);
    expect(defaulters[1].daysOverdue).toBe(15);
    expect(defaulters[1].agingBucket).toBe(AgingBucket.CURRENT);
    expect(defaulters[1].parent?.name).toBe('Babatunde Fashola');
  });

  it('2. filters defaulters by aging bucket and minimum debt amount', async () => {
    // Filter only 31-60 days overdue
    const bucketDefaulters = await debtRecoveryService.getDefaulters(
      tenantA,
      { agingBucket: AgingBucket.DAYS_31_60 },
      refDate,
    );
    expect(bucketDefaulters).toHaveLength(1);
    expect(bucketDefaulters[0].invoiceId).toBe(invoice2);

    // Filter minDebtAmount >= 200,000
    const highDebtDefaulters = await debtRecoveryService.getDefaulters(
      tenantA,
      { minDebtAmount: 200000 },
      refDate,
    );
    expect(highDebtDefaulters).toHaveLength(1);
    expect(highDebtDefaulters[0].invoiceId).toBe(invoice2);
  });

  it('3. dispatches multi-channel fee reminders with in-app inbox fanout and template interpolation', async () => {
    const result = await debtRecoveryService.sendDebtReminders(tenantA, {
      invoiceIds: [invoice1],
      channel: ReminderChannel.IN_APP,
      reminderLevel: ReminderLevel.FIRST_OVERDUE,
    });

    expect(result.remindersDispatched).toBe(1);
    expect(result.dispatchedInvoices).toContain(invoice1);

    // Verify InAppInboxItem created for parent
    const inbox = await notificationsService.listUserInbox(tenantA, parent1User);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0].category).toBe('FEE_REMINDER');
    expect(inbox.items[0].title).toContain('Demola Fashola');
    expect(inbox.items[0].message).toContain('Babatunde Fashola');
    expect(inbox.items[0].message).toContain('120,000');
    expect(inbox.items[0].actionUrl).toBe(`/portal/finance/invoices/${invoice1}`);

    // Verify invoice reminder metadata incremented
    const updatedInv = prisma.memoryStore.invoices.get(invoice1);
    expect(updatedInv?.reminderCount).toBe(1);
    expect(updatedInv?.lastReminderSentAt).toBeInstanceOf(Date);
  });

  it('4. debits communication wallet for SMS and WhatsApp fee reminders', async () => {
    // Check initial wallet balance (10,000 funded)
    const walletBefore = await walletService.getOrCreateWallet(tenantA);
    expect(walletBefore.balance).toBe(10000);

    const result = await debtRecoveryService.sendDebtReminders(tenantA, {
      invoiceIds: [invoice1],
      channel: ReminderChannel.SMS,
      reminderLevel: ReminderLevel.FIRST_OVERDUE,
    });

    expect(result.remindersDispatched).toBe(1);
    expect(result.channelsUsed).toContain('SMS');

    // Default SMS unit cost is 4.0
    const walletAfter = await walletService.getOrCreateWallet(tenantA);
    expect(walletAfter.balance).toBe(9996);

    // Send WhatsApp reminder (default unit cost 8.5)
    await debtRecoveryService.sendDebtReminders(tenantA, {
      invoiceIds: [invoice1],
      channel: ReminderChannel.WHATSAPP,
      reminderLevel: ReminderLevel.FINAL_WARNING,
    });

    const walletAfterWa = await walletService.getOrCreateWallet(tenantA);
    expect(walletAfterWa.balance).toBe(9987.5);
  });

  it('5. renders custom fee reminder template with dynamic variable substitution', async () => {
    // Create custom fee reminder template
    const customTmpl = await templateService.createTemplate(tenantA, {
      name: 'Custom Term 1 Fee Reminder',
      category: 'FEE_REMINDER' as any,
      channels: [CampaignChannel.IN_APP, CampaignChannel.EMAIL],
      subjectTemplate: 'Payment Alert for {{studentName}} [{{admissionNumber}}]',
      bodyTemplate: 'Attention {{parentName}}: Outstanding balance of {{amount}} for {{studentName}} in {{className}} is overdue. Please pay now.',
    });

    await debtRecoveryService.sendDebtReminders(tenantA, {
      invoiceIds: [invoice2],
      channel: ReminderChannel.IN_APP,
      templateId: customTmpl.id,
      reminderLevel: ReminderLevel.FINAL_WARNING,
    });

    const inbox = await notificationsService.listUserInbox(tenantA, parent2User);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0].title).toBe('Payment Alert for Chidi Okonjo [KC/2026/002]');
    expect(inbox.items[0].message).toContain('Attention Ngozi Okonjo');
    expect(inbox.items[0].message).toContain('Outstanding balance of NGN 250,000 for Chidi Okonjo in SS 1 Gold is overdue');
  });

  it('6. enforces strict multi-tenant isolation across fee debtors and reminders', async () => {
    // Setup Tenant B entity and invoice
    prisma.memoryStore.tenants.set(tenantB, { id: tenantB, name: 'Corona Secondary School', currency: 'NGN' });
    const studentB = 'std_fee_b1';
    const invoiceB = 'inv_fee_b1';

    prisma.memoryStore.students.set(studentB, {
      id: studentB,
      tenantId: tenantB,
      firstName: 'Emeka',
      lastName: 'Obi',
      admissionNumber: 'CSS/2026/09',
    });

    prisma.memoryStore.invoices.set(invoiceB, {
      id: invoiceB,
      tenantId: tenantB,
      studentId: studentB,
      invoiceNumber: 'INV-B-001',
      totalAmount: 300000,
      paidAmount: 0,
      balanceAmount: 300000,
      currency: 'NGN',
      status: 'PENDING',
      dueDate: new Date('2026-10-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    // Query Tenant A defaulters
    const defaultersA = await debtRecoveryService.getDefaulters(tenantA, {}, refDate);
    expect(defaultersA.some((d) => d.invoiceId === invoiceB)).toBe(false);

    // Query Tenant B defaulters
    const defaultersB = await debtRecoveryService.getDefaulters(tenantB, {}, refDate);
    expect(defaultersB).toHaveLength(1);
    expect(defaultersB[0].invoiceId).toBe(invoiceB);
    expect(defaultersB[0].studentName).toBe('Emeka Obi');
  });
});
