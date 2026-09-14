import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { PaystackPaymentAdapter } from './adapters/paystack.adapter.js';
import { FlutterwavePaymentAdapter } from './adapters/flutterwave.adapter.js';
import { CloudflareR2StorageProvider } from '../files/storage.provider.js';
import { BullmqService } from '../../jobs/bullmq.service.js';
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
    const paystackAdapter = new PaystackPaymentAdapter(configService);
    const flutterwaveAdapter = new FlutterwavePaymentAdapter(configService);
    const storageProvider = new CloudflareR2StorageProvider(configService as any);
    const bullmqService = new BullmqService(configService as any);
    vi.spyOn(bullmqService, 'dispatch').mockResolvedValue('mock-job' as any);

    paymentsService = new PaymentsService(
      prisma,
      paystackAdapter,
      flutterwaveAdapter,
      storageProvider,
      bullmqService,
    );
  });

  it('should verify Paystack webhook signature and process successful payment', async () => {
    prisma.memoryStore.payments.set('pay_test_123', {
      id: 'pay_test_123',
      tenantId: 'tenant_greenfield_01',
      studentId: 'stud_001',
      invoiceId: 'inv_demo_01',
      amount: 50000,
      currency: 'NGN',
      provider: 'PAYSTACK',
      reference: 'TXN_TEST_123',
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
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
