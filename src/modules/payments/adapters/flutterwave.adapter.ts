import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto, { randomUUID } from 'crypto';
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
      ''
    );
  }

  private get webhookSecretHash(): string {
    return (
      this.configService.get<string>('FLUTTERWAVE_SECRET_HASH') ||
      process.env.FLUTTERWAVE_SECRET_HASH ||
      ''
    );
  }

  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const activeKey = params.secretKey || this.secretKey;
    const isRealKey = Boolean(
      activeKey &&
      !activeKey.includes('mock') &&
      activeKey.startsWith('FLWSECK')
    );

    if (isRealKey) {
      try {
        const response = await fetch('https://api.flutterwave.com/v3/payments', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeKey}`,
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

    // Fallback URL if secret key is unconfigured or initialize failed
    return {
      authorizationUrl: `https://checkout.flutterwave.com/pay/${encodeURIComponent(params.reference)}`,
      reference: params.reference,
      provider: 'flutterwave',
    };
  }

  async verifyPayment(reference: string, customSecretKey?: string): Promise<VerifyPaymentResult> {
    const activeKey = customSecretKey || this.secretKey;
    const isRealKey = Boolean(
      activeKey &&
      !activeKey.includes('mock') &&
      activeKey.startsWith('FLWSECK')
    );

    if (isRealKey) {
      try {
        const response = await fetch(
          `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
          {
            headers: { Authorization: `Bearer ${activeKey}` },
          },
        );

        const data: any = await response.json();
        if (data.status === 'success' && data.data) {
          const tx = data.data;
          const isSuccessful = tx.status === 'successful';
          return {
            success: isSuccessful,
            reference: tx.tx_ref || reference,
            amount: Number(tx.amount || 0),
            currency: tx.currency || 'NGN',
            status: isSuccessful ? 'successful' : 'failed',
            paidAt: tx.created_at ? new Date(tx.created_at) : undefined,
            channel: tx.payment_type,
            gatewayResponse: tx.processor_response || data.message || 'Transaction processed',
            rawPayload: tx,
          };
        } else {
          return {
            success: false,
            reference,
            amount: 0,
            currency: 'NGN',
            status: 'failed',
            gatewayResponse: data?.message || 'Flutterwave transaction verification unconfirmed',
            rawPayload: data,
          };
        }
      } catch (err: any) {
        this.logger.error(`Flutterwave verify error: ${err?.message}`);
        return {
          success: false,
          reference,
          amount: 0,
          currency: 'NGN',
          status: 'failed',
          gatewayResponse: `Flutterwave verification network error: ${err?.message}`,
          rawPayload: null,
        };
      }
    }

    return {
      success: false,
      reference,
      amount: 0,
      currency: 'NGN',
      status: 'failed',
      gatewayResponse: 'Flutterwave secret key is not configured or invalid',
      rawPayload: null,
    };
  }

  async createDedicatedVirtualAccount(params: {
    customerEmail: string;
    customerName: string;
    reference: string;
    bvn?: string;
  }) {
    if (this.secretKey && !this.secretKey.includes('mock')) {
      try {
        const res = await fetch('https://api.flutterwave.com/v3/virtual-account-numbers', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: params.customerEmail,
            is_permanent: true,
            bvn: params.bvn,
            tx_ref: params.reference,
            narration: `${params.customerName} School Fees`,
          }),
        });
        const data = await res.json();
        if (data && data.status === 'success' && data.data) {
          return {
            accountNumber: data.data.account_number,
            accountName: data.data.account_name || `${params.customerName} (School Fees)`,
            bankName: data.data.bank_name || 'Sterling Bank',
            bankCode: data.data.bank_code || '232',
            reference: params.reference,
            currency: 'NGN',
          };
        }
      } catch (err: any) {
        this.logger.error(`Flutterwave DVA error: ${err?.message}`);
        if (process.env.NODE_ENV === 'production') {
          throw new BadRequestException(`Flutterwave virtual account creation failed: ${err?.message}`);
        }
      }
    }

    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Dedicated Virtual Account creation requires active Flutterwave credentials in production.');
    }

    // Virtual NUBAN simulation for development / staging sandbox
    const mockNuban = `77${Math.floor(10000000 + Math.random() * 90000000)}`;
    return {
      accountNumber: mockNuban,
      accountName: `${params.customerName} (School Fees)`,
      bankName: 'Sterling Bank (Flutterwave DVA Sandbox)',
      bankCode: '232',
      reference: params.reference,
      currency: 'NGN',
    };
  }

  verifyWebhookSignature(signature: string, _rawBody?: string | Buffer): boolean {
    if (!signature || typeof signature !== 'string') return false;
    const expected = this.webhookSecretHash;
    try {
      const sigBuf = Buffer.from(signature, 'utf8');
      const expBuf = Buffer.from(expected, 'utf8');
      return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }
}
