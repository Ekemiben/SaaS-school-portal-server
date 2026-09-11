import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentProviderAdapter,
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyPaymentResult,
} from './payment-provider.interface.js';

@Injectable()
export class FlutterwaveAdapter implements PaymentProviderAdapter {
  readonly name = 'flutterwave';
  private readonly logger = new Logger(FlutterwaveAdapter.name);
  private readonly secretKey: string;
  private readonly secretHash: string;

  constructor() {
    this.secretKey = process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-mock';
    this.secretHash = process.env.FLUTTERWAVE_SECRET_HASH || 'flutterwave_hash';
  }

  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    try {
      return {
        authorizationUrl: `https://checkout.flutterwave.com/v3/hosted/pay/${params.reference}`,
        reference: params.reference,
        provider: 'flutterwave',
      };
    } catch (err: any) {
      this.logger.error(`Flutterwave initialization error: ${err.message}`);
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
      gatewayResponse: 'Approved',
    };
  }

  verifyWebhookSignature(signature: string, _rawBody: string | Buffer): boolean {
    if (!signature) return false;
    return signature === this.secretHash;
  }
}
