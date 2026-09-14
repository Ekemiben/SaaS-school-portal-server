import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { BulkPayrollService } from '../src/modules/payroll/bulk-payroll.service.js';
import { PayrollService } from '../src/modules/payroll/payroll.service.js';
import { PayslipService } from '../src/modules/payroll/payslip.service.js';
import { CloudflareR2StorageProvider } from '../src/modules/files/storage.provider.js';

describe('Staff Payslips (Task 12 - Phase 6)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let bulkService: BulkPayrollService;
  let payrollService: PayrollService;
  let payslipService: PayslipService;
  let storageProvider: CloudflareR2StorageProvider;

  const tenantA = 'tenant_slip_alpha_01';
  const tenantB = 'tenant_slip_beta_02';
  const campusA = 'campus_slip_a1';

  const staffA1 = 'usr_slip_alpha_01';
  const staffA2 = 'usr_slip_alpha_02';
  let payrollA1Id: string;
  let payrollA2Id: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);

    storageProvider = new CloudflareR2StorageProvider();
    storageProvider.onModuleInit();

    payrollService = new PayrollService(prisma);
    bulkService = new BulkPayrollService(prisma);
    payslipService = new PayslipService(prisma, storageProvider);

    await rlsHelper.withBypassContext(async (tx) => {
      // Clean up previous runs
      await tx.payroll.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.staffSalaryProfile.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });

      // Create Tenants
      await tx.tenant.create({ data: { id: tenantA, name: 'Alpha Payslip Academy', slug: 'slip-alpha' } });
      await tx.tenant.create({ data: { id: tenantB, name: 'Beta Payslip Academy', slug: 'slip-beta' } });

      // Create Campus
      await tx.campus.create({ data: { id: campusA, tenantId: tenantA, name: 'Alpha Main', code: 'A-MAIN' } });

      // Create Users
      await tx.user.create({ data: { id: staffA1, tenantId: tenantA, email: 'tari@slip.edu', passwordHash: 'hash', firstName: 'Tari', lastName: 'Ogunlesi' } });
      await tx.user.create({ data: { id: staffA2, tenantId: tenantA, email: 'emeka@slip.edu', passwordHash: 'hash', firstName: 'Emeka', lastName: 'Okeke' } });
    });

    // Create Salary Profiles
    await bulkService.upsertStaffSalaryProfile(tenantA, {
      staffUserId: staffA1,
      campusId: campusA,
      basicSalary: 250_000,
      housingAllowance: 125_000,
      transportAllowance: 60_000,
      otherAllowances: 25_000,
      bankName: 'Zenith Bank',
      accountNumber: '1002223334',
    });

    await bulkService.upsertStaffSalaryProfile(tenantA, {
      staffUserId: staffA2,
      campusId: campusA,
      basicSalary: 180_000,
      housingAllowance: 90_000,
      transportAllowance: 40_000,
      bankName: 'GTBank',
      accountNumber: '1002223335',
    });

    // Generate and Approve Payrolls for December 2026 (Month 12)
    const p1 = await payrollService.generatePayroll(tenantA, {
      staffUserId: staffA1,
      campusId: campusA,
      month: 12,
      year: 2026,
      basicSalary: 250_000,
      housingAllowance: 125_000,
      transportAllowance: 60_000,
      otherAllowances: 25_000,
    });
    payrollA1Id = p1.id;
    await payrollService.approvePayroll(tenantA, payrollA1Id);
    await payrollService.markPaid(tenantA, payrollA1Id, 'TRF_SLIP_DEC_01');

    const p2 = await payrollService.generatePayroll(tenantA, {
      staffUserId: staffA2,
      campusId: campusA,
      month: 12,
      year: 2026,
      basicSalary: 180_000,
      housingAllowance: 90_000,
      transportAllowance: 40_000,
    });
    payrollA2Id = p2.id;
    await payrollService.approvePayroll(tenantA, payrollA2Id);
  });

  afterAll(async () => {
    await rlsHelper.withBypassContext(async (tx) => {
      await tx.payroll.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.staffSalaryProfile.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    });
    await prisma.onModuleDestroy();
  });

  it('1. Generates an individual payslip with school branding, breakdown, and presigned download URL', async () => {
    const payslip = await payslipService.generatePayslip(tenantA, payrollA1Id, staffA1);

    expect(payslip.payrollId).toBe(payrollA1Id);
    expect(payslip.staffUserId).toBe(staffA1);
    expect(payslip.staffName).toBe('Tari Ogunlesi');
    expect(payslip.month).toBe(12);
    expect(payslip.year).toBe(2026);
    expect(payslip.grossSalary).toBe(460_000);
    expect(payslip.netSalary).toBeGreaterThan(0);
    expect(payslip.storageKey).toContain(`tenants/${tenantA}/payroll/2026/12/payslip_${staffA1}.html`);
    expect(payslip.downloadUrl).toBeDefined();

    // Verify rendered HTML contents
    expect(payslip.renderedHtml).toContain('Alpha Payslip Academy');
    expect(payslip.renderedHtml).toContain('Tari Ogunlesi');
    expect(payslip.renderedHtml).toContain('DECEMBER 2026');
    expect(payslip.renderedHtml).toContain('PAYE Income Tax');
    expect(payslip.renderedHtml).toContain('Employee Pension (8%)');
    expect(payslip.renderedHtml).toContain('National Housing Fund (2.5%)');
    expect(payslip.renderedHtml).toContain('Zenith Bank: 1002223334');
    expect(payslip.renderedHtml).toContain('Net Take-Home Pay');
  });

  it('2. Retrieves staff self-service payslip history with authenticated download URLs', async () => {
    const history = await payslipService.getStaffPayslips(tenantA, staffA1, { year: 2026 });
    expect(history.length).toBe(1);
    expect(history[0].payrollId).toBe(payrollA1Id);
    expect(history[0].month).toBe(12);
    expect(history[0].year).toBe(2026);
    expect(history[0].status).toBe('PAID');
    expect(history[0].paymentReference).toBe('TRF_SLIP_DEC_01');
    expect(history[0].downloadUrl).toBeDefined();
  });

  it('3. Generates bulk payslips for all staff in a period', async () => {
    const bulk = await payslipService.bulkGeneratePayslips(tenantA, { month: 12, year: 2026 });
    expect(bulk.month).toBe(12);
    expect(bulk.year).toBe(2026);
    expect(bulk.totalGenerated).toBe(2);
    expect(bulk.payslips.length).toBe(2);
    expect(bulk.payslips.every((p: any) => Boolean(p.downloadUrl))).toBe(true);
  });

  it('4. Rejects unauthorized access when another staff user attempts to view a colleague payslip', async () => {
    await expect(
      payslipService.generatePayslip(tenantA, payrollA1Id, 'other_staff_user'),
    ).rejects.toThrow(/not authorized/);
  });

  it('5. Enforces strict multi-tenant isolation on payslip retrieval', async () => {
    // Tenant B cannot retrieve Tenant A's payslip
    await expect(
      payslipService.generatePayslip(tenantB, payrollA1Id),
    ).rejects.toThrow(/not found/);
  });
});
