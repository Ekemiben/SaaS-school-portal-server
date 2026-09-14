import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { FeesService } from '../src/modules/fees/fees.service.js';
import { FeeCalculator } from '../src/modules/fees/calculator/fee-calculator.js';

describe('Flexible Fee Structure & Component Schedules (Task 16 - Phase 8)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let feesService: FeesService;

  const tenantA = 'tenant_fees_alpha';
  const tenantB = 'tenant_fees_beta';
  const campusA = 'campus_fees_a1';
  const academicYear2026 = 'ay_fees_2026';
  const term1 = 'term_fees_first';
  const classGrade10 = 'cls_grade10_fees';
  const studentA1 = 'std_fees_01'; // New Boarding Student
  const studentA2 = 'std_fees_02'; // Returning Day Student

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);
    feesService = new FeesService(prisma);

    // Populate memory store
    prisma.memoryStore.tenants.set(tenantA, {
      id: tenantA,
      name: 'St. Augustine International College',
      slug: 'st-augustine',
      currency: 'NGN',
    });
    prisma.memoryStore.tenants.set(tenantB, {
      id: tenantB,
      name: 'Kingsway Grammar School',
      slug: 'kingsway',
      currency: 'NGN',
    });

    prisma.memoryStore.campuses.set(campusA, {
      id: campusA,
      tenantId: tenantA,
      name: 'Main Campus',
    });

    prisma.memoryStore.classes.set(classGrade10, {
      id: classGrade10,
      tenantId: tenantA,
      name: 'Grade 10 Gold',
    });

    prisma.memoryStore.students.set(studentA1, {
      id: studentA1,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classGrade10,
      admissionNumber: 'SAIC/2026/001',
      firstName: 'Kelechi',
      lastName: 'Amadi',
    });

    prisma.memoryStore.students.set(studentA2, {
      id: studentA2,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classGrade10,
      admissionNumber: 'SAIC/2025/089',
      firstName: 'Zainab',
      lastName: 'Bello',
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('1. Pure Fee Calculation Engine', () => {
    const feeItems = [
      { name: 'Tuition Fee', code: 'TUI', amount: 200000, category: 'TUITION', isOptional: false },
      { name: 'Laboratory Levy', code: 'LAB', amount: 30000, category: 'ACADEMIC', isOptional: false },
      { name: 'PTA Levy', code: 'PTA', amount: 10000, category: 'LEVY', isOptional: false },
      { name: 'Registration & Admission', code: 'REG', amount: 50000, category: 'ADMISSION', isOptional: false },
      { name: 'Boarding & Laundry', code: 'BRD', amount: 150000, category: 'BOARDING', isOptional: false },
      { name: 'School Bus Transportation', code: 'BUS', amount: 60000, category: 'TRANSPORT', isOptional: true },
      { name: 'Music Club & Instruments', code: 'MUS', amount: 25000, category: 'CO_CURRICULAR', isOptional: true },
    ];

    it('calculates mandatory fees for returning day student (excludes admission and boarding)', () => {
      const result = FeeCalculator.evaluate({
        items: feeItems,
        isNewStudent: false,
        isBoardingStudent: false,
        selectedOptionalCodes: [],
      });

      // TUI (200k) + LAB (30k) + PTA (10k) = 240k
      expect(result.subtotal).toBe(240000);
      expect(result.totalAmount).toBe(240000);
      expect(result.lineItems.find((i) => i.code === 'REG')?.isIncluded).toBe(false);
      expect(result.lineItems.find((i) => i.code === 'BRD')?.isIncluded).toBe(false);
      expect(result.lineItems.find((i) => i.code === 'BUS')?.isIncluded).toBe(false);
    });

    it('calculates full fee schedule for new boarding student with optional bus service', () => {
      const result = FeeCalculator.evaluate({
        items: feeItems,
        isNewStudent: true,
        isBoardingStudent: true,
        selectedOptionalCodes: ['BUS'],
      });

      // TUI (200k) + LAB (30k) + PTA (10k) + REG (50k) + BRD (150k) + BUS (60k) = 500k
      expect(result.subtotal).toBe(500000);
      expect(result.totalAmount).toBe(500000);
      expect(result.lineItems.find((i) => i.code === 'REG')?.isIncluded).toBe(true);
      expect(result.lineItems.find((i) => i.code === 'BRD')?.isIncluded).toBe(true);
      expect(result.lineItems.find((i) => i.code === 'BUS')?.isIncluded).toBe(true);
      expect(result.lineItems.find((i) => i.code === 'MUS')?.isIncluded).toBe(false);
    });

    it('applies early bird discount when payment is on or before cutoff date', () => {
      const result = FeeCalculator.evaluate({
        items: feeItems.slice(0, 3), // 240k subtotal
        earlyBirdDiscountPercentage: 10,
        earlyBirdCutoffDate: '2026-09-30',
        paymentDate: '2026-09-20',
      });

      expect(result.subtotal).toBe(240000);
      expect(result.discountAmount).toBe(24000); // 10% of 240k
      expect(result.totalAmount).toBe(216000);
      expect(result.isEarlyBirdApplied).toBe(true);
      expect(result.isLatePenaltyApplied).toBe(false);
    });

    it('applies late fee penalty when payment is after grace period cutoff', () => {
      const result = FeeCalculator.evaluate({
        items: feeItems.slice(0, 3), // 240k subtotal
        dueDate: '2026-10-15',
        lateFeeGraceDays: 5, // Cutoff: Oct 20
        lateFeePercentage: 5,
        paymentDate: '2026-10-25', // 5 days past grace period
      });

      expect(result.subtotal).toBe(240000);
      expect(result.latePenaltyAmount).toBe(12000); // 5% of 240k
      expect(result.totalAmount).toBe(252000);
      expect(result.isLatePenaltyApplied).toBe(true);
    });
  });

  describe('2. Fee Structure Management & Service Operations', () => {
    let createdFeeId: string;

    it('creates flexible multi-component fee structure for tenant', async () => {
      const fee = await feesService.createFeeStructure(tenantA, {
        name: 'First Term Senior Secondary Tuition Schedule',
        code: 'FEES_SS_TERM1_2026',
        campusId: campusA,
        academicYearId: academicYear2026,
        termId: term1,
        currency: 'NGN',
        dueDate: '2026-10-15',
        earlyBirdDiscountPercentage: 5,
        earlyBirdCutoffDate: '2026-09-25',
        lateFeePercentage: 5,
        lateFeeGraceDays: 7,
        items: [
          { name: 'Tuition Fee', code: 'TUI', amount: 180000, isOptional: false },
          { name: 'ICT & STEM Levy', code: 'STEM', amount: 35000, isOptional: false },
          { name: 'Excursion & Field Trip', code: 'EXC', amount: 40000, isOptional: true },
        ],
      });

      expect(fee.id).toBeDefined();
      expect(fee.amount).toBe(215000); // Mandatory 180k + 35k
      createdFeeId = fee.id;

      const list = await feesService.getFeeStructures(tenantA, {});
      expect(list.some((f: any) => f.id === fee.id)).toBe(true);
    });

    it('evaluates fee breakdown and generates invoice for student', async () => {
      const invoice = await feesService.generateInvoice(tenantA, {
        studentId: studentA1,
        feeStructureId: createdFeeId,
        selectedOptionalItemCodes: ['EXC'],
        notes: 'First Term invoice with excursion add-on',
      });

      expect(invoice.id).toBeDefined();
      expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
      expect(invoice.subtotal).toBe(255000); // 180k + 35k + 40k
      expect(invoice.discountAmount).toBe(12750); // 5% early-bird discount on 255k
      expect(invoice.totalAmount).toBe(242250); // 255k - 12.75k
      expect(invoice.balanceAmount).toBe(242250);
      expect(invoice.status).toBe('PENDING');
      expect(invoice.lineItems).toHaveLength(3);
    });

    it('applies scholarship/waiver to invoice and recalculates balance', async () => {
      const invoice = Array.from(prisma.memoryStore.invoices.values()).find(
        (i: any) => i.studentId === studentA1 && i.tenantId === tenantA,
      );

      const waiverRes = await feesService.applyFeeWaiver(tenantA, {
        invoiceId: invoice.id,
        studentId: studentA1,
        waiverType: 'SCHOLARSHIP',
        amount: 55000,
        reason: 'Academic Merit Scholarship for top entrance exam score',
      });

      expect(waiverRes.waiver.amount).toBe(55000);
      expect(waiverRes.updatedInvoice.waiverAmount).toBe(55000);
      expect(waiverRes.updatedInvoice.totalAmount).toBe(187250); // 255k - 12.75k discount - 55k waiver
      expect(waiverRes.updatedInvoice.balanceAmount).toBe(187250);
    });
  });

  describe('3. Multi-Tenant Security & Isolation', () => {
    it('strictly isolates fee structures and invoices between tenants', async () => {
      const tenantAFees = await feesService.getFeeStructures(tenantA, {});
      const tenantBFees = await feesService.getFeeStructures(tenantB, {});

      expect(tenantAFees.length).toBeGreaterThan(0);
      expect(tenantBFees.length).toBe(0);

      // Tenant B cannot access Tenant A fee structure
      await expect(
        feesService.getFeeStructureById(tenantB, tenantAFees[0].id),
      ).rejects.toThrow();
    });
  });
});
