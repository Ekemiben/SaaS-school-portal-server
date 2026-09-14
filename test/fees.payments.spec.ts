import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { CloudflareR2StorageProvider } from '../src/modules/files/storage.provider.js';
import { BullmqService } from '../src/jobs/bullmq.service.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { PaystackPaymentAdapter } from '../src/modules/payments/adapters/paystack.adapter.js';
import { FlutterwavePaymentAdapter } from '../src/modules/payments/adapters/flutterwave.adapter.js';
import { ReceiptRenderer } from '../src/modules/payments/renderer/receipt-renderer.js';
import {
  PaymentGatewayProvider,
  PaymentChannel,
} from '../src/modules/payments/dto/payment.dto.js';
import { createHmac } from 'crypto';

describe('Online Payment Gateways & Webhook Reconciliation (Task 18 - Phase 8)', () => {
  let prisma: PrismaService;
  let paymentsService: PaymentsService;
  let paystackAdapter: PaystackPaymentAdapter;
  let flutterwaveAdapter: FlutterwavePaymentAdapter;
  let storageProvider: CloudflareR2StorageProvider;
  let bullmqService: BullmqService;

  const tenantA = 'tenant_pay_alpha';
  const tenantB = 'tenant_pay_beta';
  const studentA1 = 'std_pay_01';
  const invoiceA1 = 'inv_pay_01';
  const invoiceA2 = 'inv_pay_02';

  const paystackSecret = 'sk_test_paystack_secret_123';
  const flutterwaveHash = 'flw_secret_hash_456';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    prisma.memoryStore.payments.clear();
    prisma.memoryStore.invoices.clear();

    const configServiceMock = new ConfigService({
      PAYSTACK_SECRET_KEY: paystackSecret,
      FLUTTERWAVE_SECRET_HASH: flutterwaveHash,
      CLOUDFLARE_R2_ACCOUNT_ID: 'mock-acc',
      CLOUDFLARE_R2_BUCKET_NAME: 'school-receipts',
    });

    paystackAdapter = new PaystackPaymentAdapter(configServiceMock);
    flutterwaveAdapter = new FlutterwavePaymentAdapter(configServiceMock);
    storageProvider = new CloudflareR2StorageProvider(configServiceMock as any);
    bullmqService = new BullmqService(configServiceMock as any);
    vi.spyOn(bullmqService, 'dispatch').mockResolvedValue('mock-job-id' as any);

    paymentsService = new PaymentsService(
      prisma,
      paystackAdapter,
      flutterwaveAdapter,
      storageProvider,
      bullmqService,
    );

    // Populate memory store
    prisma.memoryStore.tenants.set(tenantA, {
      id: tenantA,
      name: 'Corona Secondary School',
      slug: 'corona-school',
      currency: 'NGN',
    });
    prisma.memoryStore.tenants.set(tenantB, {
      id: tenantB,
      name: 'Atlantic Hall Academy',
      slug: 'atlantic-hall',
      currency: 'NGN',
    });

    prisma.memoryStore.students.set(studentA1, {
      id: studentA1,
      tenantId: tenantA,
      admissionNumber: 'CSS/2026/045',
      firstName: 'Tariq',
      lastName: 'Balogun',
    });

    // Invoices for Tenant A
    prisma.memoryStore.invoices.set(invoiceA1, {
      id: invoiceA1,
      tenantId: tenantA,
      studentId: studentA1,
      invoiceNumber: 'INV-2026-0089',
      subtotal: 200000,
      totalAmount: 200000,
      paidAmount: 0,
      balanceAmount: 200000,
      currency: 'NGN',
      status: 'PENDING',
      dueDate: new Date('2026-10-31'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    prisma.memoryStore.invoices.set(invoiceA2, {
      id: invoiceA2,
      tenantId: tenantA,
      studentId: studentA1,
      invoiceNumber: 'INV-2026-0090',
      subtotal: 100000,
      totalAmount: 100000,
      paidAmount: 0,
      balanceAmount: 100000,
      currency: 'NGN',
      status: 'PENDING',
      dueDate: new Date('2026-10-31'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('1. Gateway Configuration & Payment Initialization', () => {
    it('configures tenant subaccount and gateway preferences', async () => {
      const config = await paymentsService.updateGatewayConfig(tenantA, {
        defaultProvider: PaymentGatewayProvider.PAYSTACK,
        subaccountCode: 'ACCT_corona_sub_99',
        splitPercentage: 100,
        enableCardPayments: true,
        enableVirtualAccounts: true,
      });

      expect(config.defaultProvider).toBe(PaymentGatewayProvider.PAYSTACK);
      expect(config.subaccountCode).toBe('ACCT_corona_sub_99');

      const fetched = await paymentsService.getGatewayConfig(tenantA);
      expect(fetched.subaccountCode).toBe('ACCT_corona_sub_99');
    });

    it('initializes online Paystack payment for tuition invoice', async () => {
      const init = await paymentsService.initializePayment(tenantA, {
        invoiceId: invoiceA1,
        studentId: studentA1,
        amount: 200000,
        provider: PaymentGatewayProvider.PAYSTACK,
        channel: PaymentChannel.CARD,
        customerEmail: 'parent.balogun@gmail.com',
        callbackUrl: 'https://corona-school.portal.io/payments/callback',
      });

      expect(init.payment.id).toBeDefined();
      expect(init.payment.reference).toMatch(/^PAY-\d+-[A-Z0-9]+$/);
      expect(init.payment.status).toBe('PENDING');
      expect(init.payment.subaccountCode).toBe('ACCT_corona_sub_99');
      expect(init.checkoutUrl).toContain('paystack.com');
    });

    it('generates dedicated virtual bank account (DVA) for direct bank transfer payment', async () => {
      const dva = await paymentsService.createVirtualAccount(tenantA, {
        invoiceId: invoiceA2,
        studentId: studentA1,
        customerEmail: 'parent.balogun@gmail.com',
        customerName: 'Tariq Balogun',
        provider: PaymentGatewayProvider.PAYSTACK,
      });

      expect(dva.accountNumber).toBeDefined();
      expect(dva.accountName).toContain('Tariq Balogun');
      expect(dva.bankName).toContain('Wema Bank');
      expect(dva.currency).toBe('NGN');
      expect(dva.expiresAt).toBeDefined();
    });
  });

  describe('2. Real-Time Ledger Crediting & Webhook Idempotency', () => {
    let pendingPaymentRef: string;

    it('creates and verifies payment, crediting invoice to PAID in real time', async () => {
      const init = await paymentsService.initializePayment(tenantA, {
        invoiceId: invoiceA1,
        studentId: studentA1,
        amount: 200000,
        provider: PaymentGatewayProvider.PAYSTACK,
        customerEmail: 'parent.balogun@gmail.com',
      });
      pendingPaymentRef = init.reference;

      const verifyRes = await paymentsService.verifyPayment(tenantA, pendingPaymentRef);
      expect(verifyRes.success).toBe(true);
      expect(verifyRes.payment.status).toBe('SUCCESSFUL');
      expect(verifyRes.payment.paidAt).toBeDefined();

      // Verify invoice ledger updated
      const invoice = prisma.memoryStore.invoices.get(invoiceA1);
      expect(invoice.paidAmount).toBe(200000);
      expect(invoice.balanceAmount).toBe(0);
      expect(invoice.status).toBe('PAID');

      // Verify BullMQ receipt notification dispatched
      expect(bullmqService.dispatch).toHaveBeenCalled();
    });

    it('is idempotent and prevents double-crediting when re-verified', async () => {
      const reVerify = await paymentsService.verifyPayment(tenantA, pendingPaymentRef);
      expect(reVerify.success).toBe(true);
      expect(reVerify.message).toContain('already verified');

      const invoice = prisma.memoryStore.invoices.get(invoiceA1);
      expect(invoice.paidAmount).toBe(200000); // Not incremented again to 400,000
    });

    it('processes partial payments and sets status to PARTIALLY_PAID', async () => {
      // Partial payment of 40,000 on 100,000 invoiceA2
      const init = await paymentsService.initializePayment(tenantA, {
        invoiceId: invoiceA2,
        studentId: studentA1,
        amount: 40000,
        provider: PaymentGatewayProvider.FLUTTERWAVE,
        customerEmail: 'parent.balogun@gmail.com',
      });

      const verifyRes = await paymentsService.verifyPayment(tenantA, init.reference);
      expect(verifyRes.payment.status).toBe('SUCCESSFUL');

      const invoice = prisma.memoryStore.invoices.get(invoiceA2);
      expect(invoice.paidAmount).toBe(40000);
      expect(invoice.balanceAmount).toBe(60000);
      expect(invoice.status).toBe('PARTIALLY_PAID');
    });

    it('processes Paystack webhook with valid cryptographic HMAC signature', async () => {
      const init = await paymentsService.initializePayment(tenantA, {
        invoiceId: invoiceA2,
        studentId: studentA1,
        amount: 60000, // Remaining 60k
        provider: PaymentGatewayProvider.PAYSTACK,
      });

      const payload = {
        event: 'charge.success',
        data: {
          reference: init.reference,
          status: 'success',
          amount: 6000000,
        },
      };

      const signature = createHmac('sha512', paystackSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const webhookRes = await paymentsService.handleWebhook('paystack', payload, signature);
      expect(webhookRes.success).toBe(true);
      expect(webhookRes.payment.status).toBe('SUCCESSFUL');

      const invoice = prisma.memoryStore.invoices.get(invoiceA2);
      expect(invoice.paidAmount).toBe(100000);
      expect(invoice.balanceAmount).toBe(0);
      expect(invoice.status).toBe('PAID');
    });

    it('rejects webhooks with invalid cryptographic signature', async () => {
      const payload = { event: 'charge.success', data: { reference: 'PAY-fake-123' } };
      await expect(
        paymentsService.handleWebhook('paystack', payload, 'invalid_signature_hash'),
      ).rejects.toThrow();
    });
  });

  describe('3. Branded Receipts & Presigned Downloads', () => {
    it('retrieves detailed receipt metadata with tamper-proof SHA-256 security hash', async () => {
      const payment = Array.from(prisma.memoryStore.payments.values()).find(
        (p: any) => p.tenantId === tenantA && p.status === 'SUCCESSFUL',
      );

      const receipt = await paymentsService.getReceipt(tenantA, payment.id);
      expect(receipt.receiptNumber).toContain('REC-PAY-');
      expect(receipt.student.fullName).toBe('Tariq Balogun');
      expect(receipt.school.name).toBe('Corona Secondary School');
      expect(receipt.securityHash).toBeDefined();
      expect(receipt.securityHash.length).toBe(64); // SHA-256 hex length
    });

    it('generates presigned download URL for official payment receipt', async () => {
      const payment = Array.from(prisma.memoryStore.payments.values()).find(
        (p: any) => p.tenantId === tenantA && p.status === 'SUCCESSFUL',
      );

      const download = await paymentsService.getReceiptDownload(tenantA, payment.id);
      expect(download.downloadUrl).toBeDefined();
      expect(download.downloadUrl).toContain(`tenants/${tenantA}/receipts/`);
      expect(download.expiresAt).toBeDefined();
    });

    it('renders branded HTML receipt template', () => {
      const html = ReceiptRenderer.renderHtml({
        receiptNumber: 'REC-PAY-2026-001',
        issuedAt: '2026-09-15',
        school: { name: 'Corona Secondary School', primaryColor: '#059669' },
        student: { fullName: 'Tariq Balogun', admissionNumber: 'CSS/2026/045', className: 'SS 2 Gold' },
        payment: {
          id: 'pmt_01',
          reference: 'PAY-1789-001',
          transactionId: 'TXN-998877',
          amount: 200000,
          currency: 'NGN',
          provider: 'PAYSTACK',
          status: 'SUCCESSFUL',
          paidAt: '2026-09-15 10:30',
        },
        invoice: {
          invoiceNumber: 'INV-2026-0089',
          subtotal: 200000,
          discountAmount: 0,
          waiverAmount: 0,
          totalAmount: 200000,
          paidAmount: 200000,
          balanceAmount: 0,
        },
        securityHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });

      expect(html).toContain('Corona Secondary School');
      expect(html).toContain('PAYMENT RECEIVED');
      expect(html).toContain('Tariq Balogun');
      expect(html).toContain('REC-PAY-2026-001');
      expect(html).toContain('200,000');
    });
  });

  describe('4. Payment Refunds & Status Updates', () => {
    it('refunds successful payment and restores invoice balance', async () => {
      const payment = Array.from(prisma.memoryStore.payments.values()).find(
        (p: any) => p.invoiceId === invoiceA1 && p.status === 'SUCCESSFUL',
      );

      const refund = await paymentsService.refundPayment(
        tenantA,
        payment.id,
        'Duplicate transfer refund requested by parent',
        'admin_user_01',
      );

      expect(refund.success).toBe(true);
      expect(refund.payment.status).toBe('REFUNDED');
      expect(refund.payment.refundReason).toBe('Duplicate transfer refund requested by parent');

      // Invoice balance restored
      const invoice = prisma.memoryStore.invoices.get(invoiceA1);
      expect(invoice.paidAmount).toBe(0);
      expect(invoice.balanceAmount).toBe(200000);
      expect(invoice.status).toBe('PENDING');
    });
  });

  describe('5. Multi-Tenant Isolation', () => {
    it('ensures Tenant B cannot access or verify Tenant A payments', async () => {
      const tenantAPayment = Array.from(prisma.memoryStore.payments.values())[0];

      await expect(
        paymentsService.getReceipt(tenantB, tenantAPayment.id),
      ).rejects.toThrow();

      await expect(
        paymentsService.verifyPayment(tenantB, tenantAPayment.reference),
      ).rejects.toThrow();
    });
  });
});
