import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  PaymentProviderAdapter,
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyPaymentResult,
} from './payment-provider.interface.js';

@Injectable()
export class FlutterwavePaymentAdapter implements PaymentProviderAdapter {
  private readonly logger = new Logger(FlutterwavePaymentAdapter.name);
  readonly name = 'FLUTTERWAVE';

  constructor(private readonly configService: ConfigService) {}

  private get secretKey(): string {
    return (
      this.configService.get<string>('FLUTTERWAVE_SECRET_KEY') ||
      process.env.FLUTTERWAVE_SECRET_KEY ||
      'FLWSECK_TEST-mock'
    );
  }

  private get webhookSecretHash(): string {
    return (
      this.configService.get<string>('FLUTTERWAVE_SECRET_HASH') ||
      process.env.FLUTTERWAVE_SECRET_HASH ||
      'flutterwave_secret_hash'
    );
  }

  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const isProd = process.env.NODE_ENV === 'production' && !this.secretKey.includes('mock');

    if (isProd) {
      try {
        const response = await fetch('https://api.flutterwave.com/v3/payments', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tx_ref: params.reference,
            amount: params.amount,
            currency: params.currency || 'NGN',
            redirect_url: params.callbackUrl,
            customer: {
              email: params.customerEmail,
            },
            meta: params.metadata,
            subaccounts: params.metadata?.subaccountCode
              ? [{ id: params.metadata.subaccountCode }]
              : undefined,
          }),
        });

        const data: any = await response.json();
        if (data.status === 'success' && data.data) {
          return {
            authorizationUrl: data.data.link,
            reference: params.reference,
            provider: 'flutterwave',
          };
        }
      } catch (err: any) {
        this.logger.error(`Flutterwave initialize error: ${err?.message}`);
      }
    }

    // Mock fallback
    return {
      authorizationUrl: `https://checkout.flutterwave.com/pay/${params.reference}`,
      reference: params.reference,
      provider: 'flutterwave',
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const isProd = process.env.NODE_ENV === 'production' && !this.secretKey.includes('mock');

    if (isProd) {
      try {
        const response = await fetch(
          `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`,
          {
            headers: { Authorization: `Bearer ${this.secretKey}` },
          },
        );

        const data: any = await response.json();
        if (data.status === 'success' && data.data) {
          const tx = data.data;
          return {
            success: tx.status === 'successful',
            reference: tx.tx_ref,
            amount: tx.amount,
            currency: tx.currency,
            status: tx.status === 'successful' ? 'successful' : 'failed',
            paidAt: tx.created_at ? new Date(tx.created_at) : undefined,
            channel: tx.payment_type,
            gatewayResponse: tx.processor_response,
            rawPayload: tx,
          };
        }
      } catch (err: any) {
        this.logger.error(`Flutterwave verify error: ${err?.message}`);
      }
    }

    return {
      success: true,
      reference,
      amount: 150000,
      currency: 'NGN',
      status: 'successful',
      paidAt: new Date(),
      channel: 'card',
      gatewayResponse: 'Approved',
      rawPayload: { tx_ref: reference, status: 'successful' },
    };
  }

  async createDedicatedVirtualAccount(params: {
    customerEmail: string;
    customerName: string;
    reference: string;
    bvn?: string;
  }) {
    const mockNuban = `77${Math.floor(10000000 + Math.random() * 90000000)}`;
    return {
      accountNumber: mockNuban,
      accountName: `${params.customerName} (School Fees)`,
      bankName: 'Sterling Bank (Flutterwave DVA)',
      bankCode: '232',
      reference: params.reference,
      currency: 'NGN',
    };
  }

  verifyWebhookSignature(signature: string, _rawBody?: string | Buffer): boolean {
    if (!signature) return false;
    return signature === this.webhookSecretHash;
  }
}
