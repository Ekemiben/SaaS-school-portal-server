import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  PaymentProviderAdapter,
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyPaymentResult,
} from './payment-provider.interface.js';

@Injectable()
export class PaystackAdapter implements PaymentProviderAdapter {
  readonly name = 'paystack';
  private readonly logger = new Logger(PaystackAdapter.name);
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || 'sk_test_paystack_mock';
    this.webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || this.secretKey;
  }

  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    try {
      // Amount in kobo/cents
      const _amountInMinorUnits = Math.round(params.amount * 100);
      return {
        authorizationUrl: `https://checkout.paystack.com/pay/${params.reference}`,
        accessCode: `pstk_${params.reference}`,
        reference: params.reference,
        provider: 'paystack',
      };
    } catch (err: any) {
      this.logger.error(`Paystack initialization error: ${err.message}`);
      throw err;
    }
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    return {
      success: true,
      reference,
      amount: 1000,
      currency: 'NGN',
      status: 'successful',
      paidAt: new Date(),
      channel: 'card',
      gatewayResponse: 'Successful',
    };
  }

  verifyWebhookSignature(signature: string, rawBody: string | Buffer): boolean {
    if (!signature) return false;
    try {
      const hash = crypto
        .createHmac('sha512', this.webhookSecret)
        .update(rawBody)
        .digest('hex');
      return hash === signature;
    } catch (err) {
      this.logger.error(`Error verifying Paystack signature: ${err}`);
      return false;
    }
  }
}
