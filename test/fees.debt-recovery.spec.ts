import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { BullmqService } from '../src/jobs/bullmq.service.js';
import { DebtRecoveryService } from '../src/modules/fees/services/debt-recovery.service.js';
import { PaymentPlanService } from '../src/modules/fees/services/payment-plan.service.js';
import { AgingAnalysisCalculator } from '../src/modules/fees/calculator/aging-analysis-calculator.js';
import {
  AgingBucket,
  ExamType,
  ReminderChannel,
  ReminderLevel,
} from '../src/modules/fees/dto/debt-recovery.dto.js';

describe('Fee Collection Tracking & Debt Recovery / Defaulters (Task 19 - Phase 8)', () => {
  let prisma: PrismaService;
  let bullmqService: BullmqService;
  let debtRecoveryService: DebtRecoveryService;
  let paymentPlanService: PaymentPlanService;

  const tenantA = 'tenant_debt_alpha';
  const tenantB = 'tenant_debt_beta';
  const campusA = 'campus_debt_a1';
  const classJSS1 = 'cls_jss1_debt';
  const classJSS2 = 'cls_jss2_debt';

  const parent1 = 'prt_debt_01';
  const parent2 = 'prt_debt_02';
  const student1 = 'std_debt_01'; // 15 days overdue (Current)
  const student2 = 'std_debt_02'; // 45 days overdue (31-60)
  const student3 = 'std_debt_03'; // 75 days overdue (61-90)
  const student4 = 'std_debt_04'; // 120 days overdue (90+)
  const student5 = 'std_debt_05'; // Fully paid

  const invoice1 = 'inv_debt_01';
  const invoice2 = 'inv_debt_02';
  const invoice3 = 'inv_debt_03';
  const invoice4 = 'inv_debt_04';
  const invoice5 = 'inv_debt_05';

  const now = new Date('2026-10-31T00:00:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    prisma.memoryStore.invoices.clear();
    prisma.memoryStore.students.clear();

    const configServiceMock: any = { get: vi.fn() };
    bullmqService = new BullmqService(configServiceMock);
    vi.spyOn(bullmqService, 'dispatch').mockResolvedValue('mock-job-id' as any);

    debtRecoveryService = new DebtRecoveryService(prisma, bullmqService);
    paymentPlanService = new PaymentPlanService(prisma);

    // Setup Tenant & Campus
    prisma.memoryStore.tenants.set(tenantA, { id: tenantA, name: 'Loyola Jesuit College', currency: 'NGN' });
    prisma.memoryStore.tenants.set(tenantB, { id: tenantB, name: 'Corona Secondary School', currency: 'NGN' });
    prisma.memoryStore.campuses.set(campusA, { id: campusA, tenantId: tenantA, name: 'Main Campus' });

    // Classes
    prisma.memoryStore.classes.set(classJSS1, { id: classJSS1, tenantId: tenantA, name: 'JSS 1 Emerald' });
    prisma.memoryStore.classes.set(classJSS2, { id: classJSS2, tenantId: tenantA, name: 'JSS 2 Diamond' });

    // Parents
    prisma.memoryStore.parents.set(parent1, { id: parent1, tenantId: tenantA, firstName: 'Obi', lastName: 'Eze', phone: '+2348011112222', email: 'obi.eze@example.com' });
    prisma.memoryStore.parents.set(parent2, { id: parent2, tenantId: tenantA, firstName: 'Chidinma', lastName: 'Nwosu', phone: '+2348033334444', email: 'chidinma@example.com' });

    // Students
    prisma.memoryStore.students.set(student1, { id: student1, tenantId: tenantA, campusId: campusA, currentClassId: classJSS1, firstName: 'Kamsi', lastName: 'Eze', admissionNumber: 'LJC/2026/01' });
    prisma.memoryStore.students.set(student2, { id: student2, tenantId: tenantA, campusId: campusA, currentClassId: classJSS1, firstName: 'Nnamdi', lastName: 'Nwosu', admissionNumber: 'LJC/2026/02' });
    prisma.memoryStore.students.set(student3, { id: student3, tenantId: tenantA, campusId: campusA, currentClassId: classJSS2, firstName: 'Ifeoma', lastName: 'Nwosu', admissionNumber: 'LJC/2025/15' });
    prisma.memoryStore.students.set(student4, { id: student4, tenantId: tenantA, campusId: campusA, currentClassId: classJSS2, firstName: 'Uche', lastName: 'Eze', admissionNumber: 'LJC/2024/88' });
    prisma.memoryStore.students.set(student5, { id: student5, tenantId: tenantA, campusId: campusA, currentClassId: classJSS1, firstName: 'Emeka', lastName: 'Okoro', admissionNumber: 'LJC/2026/99' });

    const memory = prisma.memoryStore as any;
    memory.studentParents = new Map();
    memory.studentParents.set('sp_1', { studentId: student1, parentId: parent1 });
    memory.studentParents.set('sp_2', { studentId: student2, parentId: parent2 });
    memory.studentParents.set('sp_3', { studentId: student3, parentId: parent2 });
    memory.studentParents.set('sp_4', { studentId: student4, parentId: parent1 });

    // Invoices with varying due dates
    // 15 days overdue -> Oct 16
    prisma.memoryStore.invoices.set(invoice1, {
      id: invoice1, tenantId: tenantA, studentId: student1, classId: classJSS1, invoiceNumber: 'INV-2026-001',
      totalAmount: 200000, paidAmount: 50000, balanceAmount: 150000, currency: 'NGN', status: 'PARTIALLY_PAID',
      dueDate: new Date('2026-10-16T00:00:00.000Z'), createdAt: new Date('2026-09-01'),
    });

    // 45 days overdue -> Sep 16
    prisma.memoryStore.invoices.set(invoice2, {
      id: invoice2, tenantId: tenantA, studentId: student2, classId: classJSS1, invoiceNumber: 'INV-2026-002',
      totalAmount: 250000, paidAmount: 0, balanceAmount: 250000, currency: 'NGN', status: 'PENDING',
      dueDate: new Date('2026-09-16T00:00:00.000Z'), createdAt: new Date('2026-08-15'),
    });

    // 75 days overdue -> Aug 17
    prisma.memoryStore.invoices.set(invoice3, {
      id: invoice3, tenantId: tenantA, studentId: student3, classId: classJSS2, invoiceNumber: 'INV-2026-003',
      totalAmount: 300000, paidAmount: 100000, balanceAmount: 200000, currency: 'NGN', status: 'PARTIALLY_PAID',
      dueDate: new Date('2026-08-17T00:00:00.000Z'), createdAt: new Date('2026-07-01'),
    });

    // 120 days overdue -> July 3
    prisma.memoryStore.invoices.set(invoice4, {
      id: invoice4, tenantId: tenantA, studentId: student4, classId: classJSS2, invoiceNumber: 'INV-2026-004',
      totalAmount: 350000, paidAmount: 0, balanceAmount: 350000, currency: 'NGN', status: 'PENDING',
      dueDate: new Date('2026-07-03T00:00:00.000Z'), createdAt: new Date('2026-06-01'),
    });

    // Fully Paid Invoice
    prisma.memoryStore.invoices.set(invoice5, {
      id: invoice5, tenantId: tenantA, studentId: student5, classId: classJSS1, invoiceNumber: 'INV-2026-005',
      totalAmount: 200000, paidAmount: 200000, balanceAmount: 0, currency: 'NGN', status: 'PAID',
      dueDate: new Date('2026-10-15T00:00:00.000Z'), createdAt: new Date('2026-09-01'),
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('1. Aging Analysis Engine & Classification', () => {
    it('correctly categorizes aging buckets based on days overdue', () => {
      expect(AgingAnalysisCalculator.categorizeBucket(10)).toBe(AgingBucket.CURRENT);
      expect(AgingAnalysisCalculator.categorizeBucket(30)).toBe(AgingBucket.CURRENT);
      expect(AgingAnalysisCalculator.categorizeBucket(45)).toBe(AgingBucket.DAYS_31_60);
      expect(AgingAnalysisCalculator.categorizeBucket(75)).toBe(AgingBucket.DAYS_61_90);
      expect(AgingAnalysisCalculator.categorizeBucket(120)).toBe(AgingBucket.DAYS_90_PLUS);
    });

    it('calculates comprehensive collection rate and aging buckets', () => {
      const allInvoices = Array.from(prisma.memoryStore.invoices.values());
      const metrics = AgingAnalysisCalculator.calculateMetrics(allInvoices, now);

      // Total invoiced: 200k + 250k + 300k + 350k + 200k = 1,300,000
      expect(metrics.totalInvoiced).toBe(1300000);
      // Total paid: 50k + 0 + 100k + 0 + 200k = 350,000
      expect(metrics.totalCollected).toBe(350000);
      // Total debt: 150k + 250k + 200k + 350k = 950,000
      expect(metrics.totalOutstanding).toBe(950000);
      // Collection rate: (350k / 1300k) * 100 = 26.92%
      expect(metrics.collectionRatePercentage).toBe(26.92);

      // Aging breakdown
      expect(metrics.agingSummary.totalDefaulters).toBe(4);
      expect(metrics.agingSummary.current).toBe(150000); // student1 (15 days)
      expect(metrics.agingSummary.days31_60).toBe(250000); // student2 (45 days)
      expect(metrics.agingSummary.days61_90).toBe(200000); // student3 (75 days)
      expect(metrics.agingSummary.days90Plus).toBe(350000); // student4 (120 days)
    });
  });

  describe('2. Defaulter Discovery & Filtering', () => {
    it('discovers all defaulters with parent contact and aging details', async () => {
      const defaulters = await debtRecoveryService.getDefaulters(tenantA, {}, now);
      expect(defaulters).toHaveLength(4);
      // Sorted by balance descending
      expect(defaulters[0].studentName).toBe('Uche Eze');
      expect(defaulters[0].balanceAmount).toBe(350000);
      expect(defaulters[0].agingBucket).toBe(AgingBucket.DAYS_90_PLUS);
      expect(defaulters[0].parent.email).toBe('obi.eze@example.com');
    });

    it('filters defaulters by aging bucket and minimum debt amount', async () => {
      const criticalDefaulters = await debtRecoveryService.getDefaulters(
        tenantA,
        {
          agingBucket: AgingBucket.DAYS_90_PLUS,
          minDebtAmount: 300000,
        },
        now,
      );

      expect(criticalDefaulters).toHaveLength(1);
      expect(criticalDefaulters[0].studentId).toBe(student4);
      expect(criticalDefaulters[0].balanceAmount).toBe(350000);
    });
  });

  describe('3. Exam Clearance & Gate Pass Rules', () => {
    it('clears student for Midterm Exam when paid percentage >= 50%', async () => {
      // Set student1 paid 50% (100k of 200k)
      const inv = prisma.memoryStore.invoices.get(invoice1);
      inv.paidAmount = 100000;
      prisma.memoryStore.invoices.set(invoice1, inv);

      const clearance = await debtRecoveryService.checkExamClearance({
        tenantId: tenantA,
        studentId: student1,
        examType: ExamType.MID_TERM,
      });

      expect(clearance.isCleared).toBe(true);
      expect(clearance.financials.percentagePaid).toBe(50);
      expect(clearance.clearanceCode).toMatch(/^CLR-[A-F0-9]+$/);
      expect(clearance.policy.isExamHallRestricted).toBe(false);
    });

    it('restricts exam hall access and report card when final exam requires 100% paid', async () => {
      const clearance = await debtRecoveryService.checkExamClearance({
        tenantId: tenantA,
        studentId: student1,
        examType: ExamType.FINAL_EXAM,
      });

      expect(clearance.isCleared).toBe(false);
      expect(clearance.policy.isExamHallRestricted).toBe(true);
      expect(clearance.policy.isReportCardBlocked).toBe(true);
      expect(clearance.financials.requiredAmountForClearance).toBe(100000); // Needs remaining 100k
      expect(clearance.clearanceCode).toBeNull();
    });
  });

  describe('4. Automated Debt Recovery Reminders', () => {
    it('dispatches reminder notifications via BullMQ and updates reminder metadata', async () => {
      const reminderRes = await debtRecoveryService.sendDebtReminders(tenantA, {
        invoiceIds: [invoice2, invoice3],
        channel: ReminderChannel.EMAIL,
        reminderLevel: ReminderLevel.FIRST_OVERDUE,
      });

      expect(reminderRes.remindersDispatched).toBe(2);
      expect(bullmqService.dispatch).toHaveBeenCalled();

      // Verify invoice metadata updated
      const inv2 = prisma.memoryStore.invoices.get(invoice2);
      expect(inv2.lastReminderSentAt).toBeDefined();
      expect(inv2.reminderCount).toBe(1);
    });
  });

  describe('5. Flexible Installment Payment Plans', () => {
    it('creates structured installment plan and validates installment sum', async () => {
      const plan = await paymentPlanService.createPaymentPlan(tenantA, {
        invoiceId: invoice2,
        studentId: student2,
        notes: 'Agreed 2-part installment for second term fees',
        installments: [
          { amount: 150000, dueDate: '2026-11-15', notes: 'First installment' },
          { amount: 100000, dueDate: '2026-12-15', notes: 'Final installment' },
        ],
      });

      expect(plan.id).toBeDefined();
      expect(plan.totalAmount).toBe(250000);
      expect(plan.totalInstallments).toBe(2);
      expect(plan.installments[0].status).toBe('PENDING');
      expect(plan.status).toBe('ACTIVE');
    });

    it('records installment payment and marks installments paid sequentially', async () => {
      const updatedPlan = await paymentPlanService.recordPayment(tenantA, invoice2, 150000);
      expect(updatedPlan.installments[0].status).toBe('PAID');
      expect(updatedPlan.installments[1].status).toBe('PENDING');
      expect(updatedPlan.status).toBe('ACTIVE');

      // Pay remaining 100k
      const completedPlan = await paymentPlanService.recordPayment(tenantA, invoice2, 100000);
      expect(completedPlan.installments[1].status).toBe('PAID');
      expect(completedPlan.status).toBe('COMPLETED');
    });
  });

  describe('6. Multi-Tenant Isolation', () => {
    it('ensures Tenant B cannot see or access Tenant A defaulters or payment plans', async () => {
      const tenantBDefaulters = await debtRecoveryService.getDefaulters(tenantB);
      expect(tenantBDefaulters).toHaveLength(0);

      await expect(
        paymentPlanService.getPaymentPlan(tenantB, invoice2),
      ).rejects.toThrow();
    });
  });
});
