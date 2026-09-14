import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { PayrollService } from '../src/modules/payroll/payroll.service.js';
import { NigerianTaxCalculator } from '../src/modules/payroll/calculator/nigerian-tax-calculator.js';

describe('Nigerian Statutory Payroll Calculations (Task 9 - Phase 6)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let payrollService: PayrollService;

  const tenantA = 'tenant_payroll_alpha_01';
  const tenantB = 'tenant_payroll_beta_02';
  const campusA = 'campus_payroll_a1';
  const staffA1 = 'usr_teacher_01';
  const staffA2 = 'usr_teacher_02';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);
    payrollService = new PayrollService(prisma);

    await rlsHelper.withBypassContext(async (tx) => {
      // Clean up previous runs
      await tx.payroll.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });

      // Create Tenants
      await tx.tenant.create({ data: { id: tenantA, name: 'Payroll Academy Alpha', slug: 'pay-alpha' } });
      await tx.tenant.create({ data: { id: tenantB, name: 'Payroll Academy Beta', slug: 'pay-beta' } });

      // Create Campus
      await tx.campus.create({ data: { id: campusA, tenantId: tenantA, name: 'Alpha Main', code: 'A-MAIN' } });

      // Create Staff Users
      await tx.user.create({
        data: { id: staffA1, tenantId: tenantA, email: 'tari@alpha.edu.ng', passwordHash: 'hash', firstName: 'Tari', lastName: 'Ogun' },
      });
      await tx.user.create({
        data: { id: staffA2, tenantId: tenantA, email: 'emeka@alpha.edu.ng', passwordHash: 'hash', firstName: 'Emeka', lastName: 'Eze' },
      });
    });
  });

  afterAll(async () => {
    await rlsHelper.withBypassContext(async (tx) => {
      await tx.payroll.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    });
    await prisma.onModuleDestroy();
  });

  describe('1. Nigerian Statutory Tax & Deduction Formulas (Unit Engine)', () => {
    it('calculates standard salary breakdown with Pension, NHF, CRA, and progressive PAYE', () => {
      // Monthly gross: Basic ₦100,000 + Housing ₦50,000 + Transport ₦30,000 + Other ₦20,000 = ₦200,000
      const calc = NigerianTaxCalculator.calculate({
        basicSalary: 100_000,
        housingAllowance: 50_000,
        transportAllowance: 30_000,
        otherAllowances: 20_000,
      });

      expect(calc.grossSalary).toBe(200_000);
      expect(calc.pensionBase).toBe(180_000); // 100k + 50k + 30k
      expect(calc.pensionEmployee).toBe(14_400); // 8% of 180k
      expect(calc.pensionEmployer).toBe(18_000); // 10% of 180k
      expect(calc.nhf).toBe(2_500); // 2.5% of 100k basic

      // Annual Gross: 200,000 * 12 = ₦2,400,000
      expect(calc.annual.annualGross).toBe(2_400_000);

      // CRA: max(200k, 1% of 2.4m = 24k) + 20% of 2.4m (480k) = 200k + 480k = ₦680,000
      expect(calc.annual.craFixed).toBe(200_000);
      expect(calc.annual.craVariable).toBe(480_000);
      expect(calc.annual.craTotal).toBe(680_000);

      // Total Annual Reliefs: CRA (680k) + Pension (14.4k * 12 = 172.8k) + NHF (2.5k * 12 = 30k) = ₦882,800
      expect(calc.annual.annualPension).toBe(172_800);
      expect(calc.annual.annualNhf).toBe(30_000);
      expect(calc.annual.totalReliefs).toBe(882_800);

      // Taxable Income: 2,400,000 - 882,800 = ₦1,517,200
      expect(calc.annual.taxableIncome).toBe(1_517_200);

      // PAYE Tax Bands for ₦1,517,200:
      // Band 1: 300,000 @ 7% = 21,000
      // Band 2: 300,000 @ 11% = 33,000
      // Band 3: 500,000 @ 15% = 75,000
      // Band 4: (1,517,200 - 1,100,000 = 417,200) @ 19% = 79,268
      // Total Annual Tax = 21,000 + 33,000 + 75,000 + 79,268 = ₦208,268
      expect(calc.annual.annualTax).toBe(208_268);
      expect(calc.payeTax).toBeCloseTo(17_355.67, 1);

      // Net Salary: Gross (200,000) - Deductions (Pension 14,400 + NHF 2,500 + PAYE 17,355.67) = ₦165,744.33
      expect(calc.netSalary).toBeCloseTo(165_744.33, 1);
      expect(calc.totalEmployerCost).toBe(218_000); // Gross 200k + Employer Pension 18k
    });

    it('respects statutory exemptions (Pension Exempt, NHF Exempt, Tax Exempt)', () => {
      const calc = NigerianTaxCalculator.calculate({
        basicSalary: 150_000,
        housingAllowance: 50_000,
        transportAllowance: 50_000,
        isPensionExempt: true,
        isNhfExempt: true,
        isTaxExempt: true,
      });

      expect(calc.pensionEmployee).toBe(0);
      expect(calc.pensionEmployer).toBe(0);
      expect(calc.nhf).toBe(0);
      expect(calc.payeTax).toBe(0);
      expect(calc.totalDeductions).toBe(0);
      expect(calc.netSalary).toBe(250_000);
    });

    it('applies Minimum Tax rule (1% of Gross) when taxable income is zero or below minimum threshold', () => {
      // Annual gross ₦480,000 (₦40,000/month) where reliefs exceed gross
      const calc = NigerianTaxCalculator.calculate({
        basicSalary: 30_000,
        housingAllowance: 5_000,
        transportAllowance: 5_000,
        customReliefs: 50_000, // Large additional tax reliefs
      });

      expect(calc.annual.taxableIncome).toBe(0);
      expect(calc.annual.isMinimumTaxApplied).toBe(true);
      expect(calc.annual.annualTax).toBe(4_800); // 1% of 480,000
      expect(calc.payeTax).toBe(400); // 4,800 / 12
    });
  });

  describe('2. Payroll Service Persistence & Workflow', () => {
    let payrollRecordId: string;

    it('generates a staff payroll record with full statutory breakdown and DRAFT status', async () => {
      const record = await payrollService.generatePayroll(tenantA, {
        staffUserId: staffA1,
        campusId: campusA,
        month: 9,
        year: 2026,
        basicSalary: 120_000,
        housingAllowance: 60_000,
        transportAllowance: 30_000,
        otherAllowances: 10_000,
        notes: 'September 2026 Salary',
      });

      expect(record.id).toBeDefined();
      expect(record.status).toBe('DRAFT');
      expect(record.grossSalary).toBe(220_000);
      expect(record.pensionEmployee).toBe(16_800); // 8% of 210k
      expect(record.pensionEmployer).toBe(21_000); // 10% of 210k
      expect(record.nhf).toBe(3_000); // 2.5% of 120k
      expect(record.payeTax).toBeGreaterThan(0);
      expect(record.netSalary).toBeLessThan(220_000);
      expect(record.currency).toBe('NGN');
      expect(record.breakdown).toBeDefined();

      payrollRecordId = record.id;
    });

    it('prevents duplicate payroll generation for the same staff in the same period', async () => {
      await expect(
        payrollService.generatePayroll(tenantA, {
          staffUserId: staffA1,
          month: 9,
          year: 2026,
          basicSalary: 120_000,
        }),
      ).rejects.toThrow(/already exists/);
    });

    it('approves a draft payroll record', async () => {
      const approved = await payrollService.approvePayroll(tenantA, payrollRecordId);
      expect(approved.status).toBe('APPROVED');
    });

    it('marks payroll as paid with payment reference', async () => {
      const paid = await payrollService.markPaid(tenantA, payrollRecordId, 'PAYSTACK_TRF_99887766');
      expect(paid.status).toBe('PAID');
      expect(paid.paymentDate).toBeDefined();
      expect(paid.paymentReference).toBe('PAYSTACK_TRF_99887766');
    });

    it('retrieves payroll record by id and list with filters', async () => {
      const single = await payrollService.getPayrollById(tenantA, payrollRecordId);
      expect(single.id).toBe(payrollRecordId);
      expect(single.grossSalary).toBe(220_000);

      const list = await payrollService.listPayroll(tenantA, { month: 9, year: 2026 });
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0].staffUserId).toBe(staffA1);
    });

    it('enforces multi-tenant isolation on payroll access and updates', async () => {
      // Tenant B cannot retrieve Tenant A's payroll
      await expect(
        payrollService.getPayrollById(tenantB, payrollRecordId),
      ).rejects.toThrow(/not found/);

      // Tenant B cannot approve Tenant A's payroll
      await expect(
        payrollService.approvePayroll(tenantB, payrollRecordId),
      ).rejects.toThrow(/not found/);
    });
  });
});
