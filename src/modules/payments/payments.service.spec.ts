import { describe, it, expect, beforeEach } from 'vitest';
import { PaymentsService } from './payments.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ConfigService } from '@nestjs/config';
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
    paymentsService = new PaymentsService(prisma, configService);
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
