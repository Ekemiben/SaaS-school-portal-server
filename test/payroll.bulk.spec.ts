import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { BulkPayrollService } from '../src/modules/payroll/bulk-payroll.service.js';
import { PayrollService } from '../src/modules/payroll/payroll.service.js';

describe('Bulk Payroll Generation (Task 10 - Phase 6)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let bulkService: BulkPayrollService;
  let payrollService: PayrollService;

  const tenantA = 'tenant_bulk_alpha_01';
  const tenantB = 'tenant_bulk_beta_02';
  const campusA1 = 'campus_bulk_a1';
  const campusA2 = 'campus_bulk_a2';

  const staffA1 = 'usr_staff_alpha_01';
  const staffA2 = 'usr_staff_alpha_02';
  const staffA3 = 'usr_staff_alpha_03';
  const staffB1 = 'usr_staff_beta_01';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);
    bulkService = new BulkPayrollService(prisma);
    payrollService = new PayrollService(prisma);

    await rlsHelper.withBypassContext(async (tx) => {
      // Clean up previous runs
      await tx.payroll.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.staffSalaryProfile.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });

      // Create Tenants
      await tx.tenant.create({ data: { id: tenantA, name: 'Alpha Bulk Academy', slug: 'bulk-alpha' } });
      await tx.tenant.create({ data: { id: tenantB, name: 'Beta Bulk Academy', slug: 'bulk-beta' } });

      // Create Campuses
      await tx.campus.create({ data: { id: campusA1, tenantId: tenantA, name: 'Alpha Campus 1', code: 'A-CAMP1' } });
      await tx.campus.create({ data: { id: campusA2, tenantId: tenantA, name: 'Alpha Campus 2', code: 'A-CAMP2' } });

      // Create Users
      await tx.user.create({ data: { id: staffA1, tenantId: tenantA, email: 'staff1@alpha.edu', passwordHash: 'hash', firstName: 'Alice', lastName: 'Smith' } });
      await tx.user.create({ data: { id: staffA2, tenantId: tenantA, email: 'staff2@alpha.edu', passwordHash: 'hash', firstName: 'Bob', lastName: 'Jones' } });
      await tx.user.create({ data: { id: staffA3, tenantId: tenantA, email: 'staff3@alpha.edu', passwordHash: 'hash', firstName: 'Carol', lastName: 'Williams' } });
      await tx.user.create({ data: { id: staffB1, tenantId: tenantB, email: 'staff1@beta.edu', passwordHash: 'hash', firstName: 'David', lastName: 'Brown' } });
    });

    // Create Salary Profiles for Tenant A
    await bulkService.upsertStaffSalaryProfile(tenantA, {
      staffUserId: staffA1,
      campusId: campusA1,
      basicSalary: 150_000,
      housingAllowance: 75_000,
      transportAllowance: 35_000,
      otherAllowances: 15_000,
      bankName: 'Zenith Bank',
      accountNumber: '1000000001',
      accountName: 'Alice Smith',
    });

    await bulkService.upsertStaffSalaryProfile(tenantA, {
      staffUserId: staffA2,
      campusId: campusA1,
      basicSalary: 200_000,
      housingAllowance: 100_000,
      transportAllowance: 50_000,
      bankName: 'Access Bank',
      accountNumber: '1000000002',
      accountName: 'Bob Jones',
    });

    await bulkService.upsertStaffSalaryProfile(tenantA, {
      staffUserId: staffA3,
      campusId: campusA2,
      basicSalary: 120_000,
      housingAllowance: 60_000,
      transportAllowance: 30_000,
      bankName: 'GTBank',
      accountNumber: '1000000003',
      accountName: 'Carol Williams',
    });

    // Create Salary Profile for Tenant B
    await bulkService.upsertStaffSalaryProfile(tenantB, {
      staffUserId: staffB1,
      basicSalary: 180_000,
      housingAllowance: 90_000,
      transportAllowance: 40_000,
    });
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

  it('1. Creates and lists staff salary profiles for a tenant', async () => {
    const profiles = await bulkService.listStaffSalaryProfiles(tenantA);
    expect(profiles.length).toBe(3);
    const staffIds = profiles.map((p: any) => p.staffUserId);
    expect(staffIds).toContain(staffA1);
    expect(staffIds).toContain(staffA2);
    expect(staffIds).toContain(staffA3);
  });

  it('2. Bulk generates payroll for all eligible staff in Tenant A for a given month and year', async () => {
    const result = await bulkService.generateBulkPayroll(tenantA, {
      month: 10,
      year: 2026,
      notes: 'October 2026 Salary Run',
    });

    expect(result.month).toBe(10);
    expect(result.year).toBe(2026);
    expect(result.totalEligibleStaff).toBe(3);
    expect(result.totalGenerated).toBe(3);
    expect(result.totalSkipped).toBe(0);

    // Summary checks
    expect(result.summary.totalGross).toBeGreaterThan(0);
    expect(result.summary.totalNet).toBeGreaterThan(0);
    expect(result.summary.totalPaye).toBeGreaterThan(0);
    expect(result.summary.totalPensionEmployee).toBeGreaterThan(0);
    expect(result.summary.totalPensionEmployer).toBeGreaterThan(0);
    expect(result.summary.totalNhf).toBeGreaterThan(0);
    expect(result.summary.totalEmployerCost).toBeGreaterThan(result.summary.totalGross);

    // Verify all generated records in database
    const payrolls = await payrollService.listPayroll(tenantA, { month: 10, year: 2026 });
    expect(payrolls.length).toBe(3);
    expect(payrolls.every((p: any) => p.status === 'DRAFT')).toBe(true);
  });

  it('3. Idempotently skips already generated payrolls when overrideExisting is false', async () => {
    const rerun = await bulkService.generateBulkPayroll(tenantA, {
      month: 10,
      year: 2026,
      overrideExisting: false,
    });

    expect(rerun.totalGenerated).toBe(0);
    expect(rerun.totalSkipped).toBe(3);
    expect(rerun.skipped[0].reason).toContain('Already exists');
  });

  it('4. Recalculates and updates existing records when overrideExisting is true', async () => {
    const rerun = await bulkService.generateBulkPayroll(tenantA, {
      month: 10,
      year: 2026,
      overrideExisting: true,
      notes: 'October 2026 Recalculated Run',
    });

    expect(rerun.totalGenerated).toBe(3);
    expect(rerun.totalSkipped).toBe(0);

    const single = await payrollService.listPayroll(tenantA, { month: 10, year: 2026, staffUserId: staffA1 });
    expect(single[0].notes).toBe('October 2026 Recalculated Run');
  });

  it('5. Filters bulk generation by specific campus', async () => {
    const campusRun = await bulkService.generateBulkPayroll(tenantA, {
      month: 11,
      year: 2026,
      campusId: campusA2,
    });

    expect(campusRun.totalEligibleStaff).toBe(1);
    expect(campusRun.totalGenerated).toBe(1);
    expect(campusRun.records[0].staffUserId).toBe(staffA3);
  });

  it('6. Bulk approves all draft payroll records for a period', async () => {
    const approval = await bulkService.bulkApprovePayroll(tenantA, {
      month: 10,
      year: 2026,
    });

    expect(approval.approvedCount).toBe(3);

    const approvedPayrolls = await payrollService.listPayroll(tenantA, { month: 10, year: 2026 });
    expect(approvedPayrolls.every((p: any) => p.status === 'APPROVED')).toBe(true);
  });

  it('7. Enforces strict multi-tenant isolation on bulk operations', async () => {
    // Tenant B cannot see Tenant A's salary profiles
    const profilesB = await bulkService.listStaffSalaryProfiles(tenantB);
    expect(profilesB.length).toBe(1);
    expect(profilesB[0].staffUserId).toBe(staffB1);

    // Tenant B bulk generate only processes Tenant B's staff
    const runB = await bulkService.generateBulkPayroll(tenantB, { month: 10, year: 2026 });
    expect(runB.totalGenerated).toBe(1);
    expect(runB.records[0].staffUserId).toBe(staffB1);

    // Tenant B bulk approve does not affect Tenant A's payrolls
    const approveB = await bulkService.bulkApprovePayroll(tenantB, { month: 10, year: 2026 });
    expect(approveB.approvedCount).toBe(1);
  });
});
