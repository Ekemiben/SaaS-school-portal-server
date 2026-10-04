import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { PaystackPaymentAdapter } from './adapters/paystack.adapter.js';
import { FlutterwavePaymentAdapter } from './adapters/flutterwave.adapter.js';
import { CloudflareR2StorageProvider } from '../files/storage.provider.js';
import { QueueService } from '../../jobs/queue.service.js';
import { createHmac } from 'crypto';

describe('PaymentsService Webhooks and Receipts', () => {
  let paymentsService: PaymentsService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = new PrismaService();
    const configService = new ConfigService({
      PAYSTACK_SECRET_KEY: 'test_paystack_secret',
      FLUTTERWAVE_SECRET_HASH: 'test_flw_secret',
    });
    const paystackAdapter = new PaystackPaymentAdapter(configService, prisma);
    const flutterwaveAdapter = new FlutterwavePaymentAdapter(configService);
    const storageProvider = new CloudflareR2StorageProvider(configService as any);
    const queueService = new QueueService();
    vi.spyOn(queueService, 'dispatch').mockResolvedValue({ jobId: 'mock-job', queue: 'notifications' } as any);

    paymentsService = new PaymentsService(
      prisma,
      paystackAdapter,
      flutterwaveAdapter,
      storageProvider,
      queueService,
    );
  });

  it('should verify Paystack webhook signature and process successful payment', async () => {
    const paymentRecord = {
      id: 'pay_test_123',
      tenantId: 'tenant_greenfield_01',
      studentId: 'stud_001',
      invoiceId: 'inv_demo_01',
      amount: 50000,
      currency: 'NGN',
      provider: 'PAYSTACK',
      reference: 'TXN_TEST_123',
      status: 'PENDING',
      metadata: { invoiceId: 'inv_demo_01' },
      createdAt: new Date(),
      updatedAt: new Date(),
      invoice: {
        id: 'inv_demo_01',
        totalAmount: 50000,
        paidAmount: 0,
        balanceAmount: 50000,
      },
      student: {
        id: 'stud_001',
        firstName: 'John',
        lastName: 'Doe',
      },
    };

    vi.spyOn(prisma.payment, 'findFirst').mockResolvedValue(paymentRecord as any);
    vi.spyOn(prisma.payment, 'updateMany').mockResolvedValue({ count: 1 });
    vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue({
      ...paymentRecord,
      status: 'SUCCESSFUL',
    } as any);
    vi.spyOn(prisma.invoice, 'findFirst').mockResolvedValue(paymentRecord.invoice as any);
    vi.spyOn(prisma.invoice, 'update').mockResolvedValue({
      ...paymentRecord.invoice,
      paidAmount: 50000,
      balanceAmount: 0,
      status: 'PAID',
    } as any);
    vi.spyOn(prisma.studentParent, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      return cb;
    });

    const payload = {
      event: 'charge.success',
      data: {
        reference: 'TXN_TEST_123',
        status: 'success',
        amount: 5000000,
        metadata: {
          invoiceId: 'inv_demo_01',
          tenantId: 'tenant_greenfield_01',
        },
      },
    };

    const signature = createHmac('sha512', 'test_paystack_secret')
      .update(JSON.stringify(payload))
      .digest('hex');

    const result = await paymentsService.handleWebhook('paystack', payload, signature);
    expect(result.success).toBe(true);
    expect(result.payment.status).toBe('SUCCESSFUL');
  });

  it('should reject invalid webhook signatures with 401 Unauthorized', async () => {
    const payload = { event: 'charge.success' };
    await expect(
      paymentsService.handleWebhook('paystack', payload, 'invalid_signature_hash'),
    ).rejects.toThrow();
  });
});
