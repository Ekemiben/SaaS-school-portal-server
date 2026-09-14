import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as crypto from 'crypto';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { BulkPayrollService } from '../src/modules/payroll/bulk-payroll.service.js';
import { PayrollService } from '../src/modules/payroll/payroll.service.js';
import { PayrollDisbursementService } from '../src/modules/payroll/payroll-disbursement.service.js';
import { PaystackDisbursementAdapter } from '../src/modules/payroll/disbursement/paystack-disbursement.adapter.js';
import { FlutterwaveDisbursementAdapter } from '../src/modules/payroll/disbursement/flutterwave-disbursement.adapter.js';
import { DisbursementProviderFactory } from '../src/modules/payroll/disbursement/disbursement-provider.factory.js';

describe('Payroll Bank Disbursement (Task 11 - Phase 6)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let bulkService: BulkPayrollService;
  let payrollService: PayrollService;
  let disbursementService: PayrollDisbursementService;

  const tenantA = 'tenant_disb_alpha_01';
  const tenantB = 'tenant_disb_beta_02';
  const campusA = 'campus_disb_a1';

  const staffA1 = 'usr_disb_alpha_01';
  const staffA2 = 'usr_disb_alpha_02';
  const staffNoBank = 'usr_disb_nobank_03';

  let payrollA1Id: string;
  let payrollA2Id: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);

    const paystack = new PaystackDisbursementAdapter();
    const flutterwave = new FlutterwaveDisbursementAdapter();
    const factory = new DisbursementProviderFactory(paystack, flutterwave);

    payrollService = new PayrollService(prisma);
    bulkService = new BulkPayrollService(prisma);
    disbursementService = new PayrollDisbursementService(prisma, factory);

    await rlsHelper.withBypassContext(async (tx) => {
      // Clean up previous runs
      await tx.payroll.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.staffSalaryProfile.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });

      // Create Tenants
      await tx.tenant.create({ data: { id: tenantA, name: 'Alpha Disbursement Academy', slug: 'disb-alpha' } });
      await tx.tenant.create({ data: { id: tenantB, name: 'Beta Disbursement Academy', slug: 'disb-beta' } });

      // Create Campus
      await tx.campus.create({ data: { id: campusA, tenantId: tenantA, name: 'Alpha Main', code: 'A-MAIN' } });

      // Create Users
      await tx.user.create({ data: { id: staffA1, tenantId: tenantA, email: 'tari@alpha.edu', passwordHash: 'hash', firstName: 'Tari', lastName: 'Ogunlesi' } });
      await tx.user.create({ data: { id: staffA2, tenantId: tenantA, email: 'emeka@alpha.edu', passwordHash: 'hash', firstName: 'Emeka', lastName: 'Okeke' } });
      await tx.user.create({ data: { id: staffNoBank, tenantId: tenantA, email: 'nobank@alpha.edu', passwordHash: 'hash', firstName: 'Dayo', lastName: 'Ade' } });
    });

    // Create Salary Profiles
    await bulkService.upsertStaffSalaryProfile(tenantA, {
      staffUserId: staffA1,
      campusId: campusA,
      basicSalary: 200_000,
      housingAllowance: 100_000,
      transportAllowance: 50_000,
      bankName: 'Zenith Bank',
      bankCode: '057',
      accountNumber: '2001112223',
      accountName: 'Tari Ogunlesi',
    });

    await bulkService.upsertStaffSalaryProfile(tenantA, {
      staffUserId: staffA2,
      campusId: campusA,
      basicSalary: 150_000,
      housingAllowance: 75_000,
      transportAllowance: 35_000,
      bankName: 'Access Bank',
      bankCode: '044',
      accountNumber: '2001112224',
      accountName: 'Emeka Okeke',
    });

    await bulkService.upsertStaffSalaryProfile(tenantA, {
      staffUserId: staffNoBank,
      basicSalary: 100_000,
      // No bank details provided
    });

    // Generate and Approve Payrolls for month 11 / 2026
    const p1 = await payrollService.generatePayroll(tenantA, {
      staffUserId: staffA1,
      campusId: campusA,
      month: 11,
      year: 2026,
      basicSalary: 200_000,
      housingAllowance: 100_000,
      transportAllowance: 50_000,
    });
    payrollA1Id = p1.id;
    await payrollService.approvePayroll(tenantA, payrollA1Id);

    const p2 = await payrollService.generatePayroll(tenantA, {
      staffUserId: staffA2,
      campusId: campusA,
      month: 11,
      year: 2026,
      basicSalary: 150_000,
      housingAllowance: 75_000,
      transportAllowance: 35_000,
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

  it('1. Initiates individual bank disbursement via Paystack adapter and transitions payroll to PROCESSING', async () => {
    const result = await disbursementService.disbursePayroll(tenantA, payrollA1Id, {
      provider: 'paystack',
    });

    expect(result.payrollId).toBe(payrollA1Id);
    expect(result.provider).toBe('paystack');
    expect(result.transferStatus).toBe('PROCESSING');
    expect(result.payrollStatus).toBe('PROCESSING');
    expect(result.paymentReference).toContain('TRF_');
    expect(result.recipientAccount).toBe('2001112223');

    const updated = await payrollService.getPayrollById(tenantA, payrollA1Id);
    expect(updated.status).toBe('PROCESSING');
    expect(updated.paymentReference).toBe(result.paymentReference);
  });

  it('2. Initiates individual bank disbursement via Flutterwave adapter', async () => {
    const result = await disbursementService.disbursePayroll(tenantA, payrollA2Id, {
      provider: 'flutterwave',
    });

    expect(result.payrollId).toBe(payrollA2Id);
    expect(result.provider).toBe('flutterwave');
    expect(result.transferStatus).toBe('PROCESSING');
    expect(result.recipientAccount).toBe('2001112224');
  });

  it('3. Reconciles transfer status with payment gateway and marks payroll as PAID upon settlement', async () => {
    const recon = await disbursementService.reconcilePayroll(tenantA, payrollA1Id, 'paystack');
    expect(recon.payrollId).toBe(payrollA1Id);
    expect(recon.status).toBe('SUCCESS');

    const updated = await payrollService.getPayrollById(tenantA, payrollA1Id);
    expect(updated.status).toBe('PAID');
    expect(updated.paymentDate).toBeDefined();
  });

  it('4. Rejects disbursement when staff has no bank account configured', async () => {
    const noBankPay = await payrollService.generatePayroll(tenantA, {
      staffUserId: staffNoBank,
      month: 11,
      year: 2026,
      basicSalary: 100_000,
    });
    await payrollService.approvePayroll(tenantA, noBankPay.id);

    await expect(
      disbursementService.disbursePayroll(tenantA, noBankPay.id),
    ).rejects.toThrow(/does not have bank account details configured/);
  });

  it('5. Rejects disbursement for payroll already in PAID status', async () => {
    await expect(
      disbursementService.disbursePayroll(tenantA, payrollA1Id),
    ).rejects.toThrow(/already been paid/);
  });

  it('6. Handles webhook transfer.success event with HMAC signature verification and marks payroll PAID', async () => {
    const updatedA2 = await payrollService.getPayrollById(tenantA, payrollA2Id);
    const ref = updatedA2.paymentReference!;

    const payload = {
      event: 'transfer.success',
      data: { reference: ref, amount: 20000000 },
    };
    const rawBody = JSON.stringify(payload);
    const secret = process.env.PAYSTACK_SECRET_KEY || 'sk_test_paystack_mock';
    const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

    const webhookResult = await disbursementService.processWebhook('paystack', signature, payload, rawBody);
    expect(webhookResult.status).toBe('PROCESSED');
    expect(webhookResult.event).toBe('transfer.success');

    const record = await payrollService.getPayrollById(tenantA, payrollA2Id);
    expect(record.status).toBe('PAID');
    expect(record.paymentDate).toBeDefined();
  });

  it('7. Rejects webhook with invalid HMAC signature', async () => {
    const payload = { event: 'transfer.success', data: { reference: 'some_ref' } };
    await expect(
      disbursementService.processWebhook('paystack', 'invalid_fake_signature', payload, JSON.stringify(payload)),
    ).rejects.toThrow(/Invalid signature/);
  });

  it('8. Enforces multi-tenant security on disbursement and reconciliation', async () => {
    // Tenant B cannot disburse Tenant A's payroll
    await expect(
      disbursementService.disbursePayroll(tenantB, payrollA1Id),
    ).rejects.toThrow(/not found/);

    // Tenant B cannot reconcile Tenant A's payroll
    await expect(
      disbursementService.reconcilePayroll(tenantB, payrollA1Id),
    ).rejects.toThrow(/not found/);
  });
});
