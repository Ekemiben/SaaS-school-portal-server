import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PaystackPaymentAdapter } from '../src/modules/payments/adapters/paystack.adapter.js';
import { FlutterwavePaymentAdapter } from '../src/modules/payments/adapters/flutterwave.adapter.js';

describe('Phase 1: Payment Adapters Security Verification', () => {
  const configService = new ConfigService({});
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('PaystackPaymentAdapter', () => {
    const adapter = new PaystackPaymentAdapter(configService);

    it('should return failed verification when secret key is unconfigured or mock', async () => {
      const result = await adapter.verifyPayment('fake-ref-12345');
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.amount).toBe(0);
      expect(result.gatewayResponse).toContain('not configured or invalid');
    });

    it('should NOT return simulated success of 150000 NGN', async () => {
      const result = await adapter.verifyPayment('any-random-reference');
      expect(result.success).not.toBe(true);
      expect(result.amount).not.toBe(150000);
      expect((result.rawPayload as any)?.isDevSimulation).toBeUndefined();
    });

    it('should handle gateway returning transaction not found or false status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ status: false, message: 'Transaction reference not found' }),
      } as any);

      const result = await adapter.verifyPayment('ref-unknown', 'sk_test_1234567890abcdef');
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.gatewayResponse).toContain('Transaction reference not found');
    });

    it('should handle gateway returning failed transaction status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          status: true,
          data: {
            reference: 'ref-failed-123',
            amount: 100000,
            currency: 'NGN',
            status: 'failed',
            gateway_response: 'Insufficient funds',
          },
        }),
      } as any);

      const result = await adapter.verifyPayment('ref-failed-123', 'sk_test_1234567890abcdef');
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.amount).toBe(1000); // 100000 kobo = 1000 NGN
      expect(result.gatewayResponse).toBe('Insufficient funds');
    });

    it('should return success only when upstream gateway genuinely returns success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          status: true,
          data: {
            reference: 'ref-success-789',
            amount: 2500000, // 25,000 NGN
            currency: 'NGN',
            status: 'success',
            gateway_response: 'Successful',
            paid_at: '2026-10-15T12:00:00Z',
            channel: 'card',
          },
        }),
      } as any);

      const result = await adapter.verifyPayment('ref-success-789', 'sk_test_1234567890abcdef');
      expect(result.success).toBe(true);
      expect(result.status).toBe('successful');
      expect(result.amount).toBe(25000);
      expect(result.currency).toBe('NGN');
      expect(result.channel).toBe('card');
    });
  });

  describe('FlutterwavePaymentAdapter', () => {
    const adapter = new FlutterwavePaymentAdapter(configService);

    it('should return failed verification when secret key is unconfigured or mock', async () => {
      const result = await adapter.verifyPayment('fake-ref-67890');
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.amount).toBe(0);
      expect(result.gatewayResponse).toContain('not configured or invalid');
    });

    it('should NOT return simulated success of 150000 NGN', async () => {
      const result = await adapter.verifyPayment('any-random-reference');
      expect(result.success).not.toBe(true);
      expect(result.amount).not.toBe(150000);
    });

    it('should handle gateway returning transaction error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ status: 'error', message: 'No transaction was found with given tx_ref' }),
      } as any);

      const result = await adapter.verifyPayment('flw-ref-unknown', 'FLWSECK-1234567890');
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.gatewayResponse).toContain('No transaction was found');
    });

    it('should return success only when Flutterwave confirms transaction is successful', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          status: 'success',
          data: {
            tx_ref: 'flw-ref-success-999',
            amount: 45000,
            currency: 'NGN',
            status: 'successful',
            processor_response: 'Approved',
            payment_type: 'card',
            created_at: '2026-10-15T12:00:00Z',
          },
        }),
      } as any);

      const result = await adapter.verifyPayment('flw-ref-success-999', 'FLWSECK-1234567890');
      expect(result.success).toBe(true);
      expect(result.status).toBe('successful');
      expect(result.amount).toBe(45000);
      expect(result.currency).toBe('NGN');
      expect(result.channel).toBe('card');
    });
  });
});
