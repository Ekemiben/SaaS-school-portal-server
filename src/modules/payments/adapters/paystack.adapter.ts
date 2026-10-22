import { Injectable, Logger, Optional, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service.js';
import crypto, { randomUUID } from 'crypto';
import {
  PaymentProviderAdapter,
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyPaymentResult,
} from './payment-provider.interface.js';

@Injectable()
export class PaystackPaymentAdapter implements PaymentProviderAdapter {
  private readonly logger = new Logger(PaystackPaymentAdapter.name);
  readonly name = 'PAYSTACK';

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  private get secretKey(): string {
    return (
      this.configService.get<string>('PAYSTACK_SECRET_KEY') ||
      process.env.PAYSTACK_SECRET_KEY ||
      ''
    );
  }

  private get webhookSecret(): string {
    return (
      this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET') ||
      process.env.PAYSTACK_WEBHOOK_SECRET ||
      this.secretKey
    );
  }

  private get isConfiguredRealKey(): boolean {
    const key = this.secretKey;
    return Boolean(
      key &&
      !key.includes('mock') &&
      (key.startsWith('sk_live_') || key.startsWith('sk_test_'))
    );
  }

  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const amountInKobo = Math.round(params.amount * 100);
    const activeKey = params.secretKey || this.secretKey;
    const isRealKey = Boolean(
      activeKey &&
      !activeKey.includes('mock') &&
      (activeKey.startsWith('sk_live_') || activeKey.startsWith('sk_test_'))
    );

    if (isRealKey) {
      try {
        const response = await fetch('https://api.paystack.co/transaction/initialize', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: params.customerEmail,
            amount: amountInKobo,
            reference: params.reference,
            callback_url: params.callbackUrl,
            metadata: params.metadata,
            subaccount: params.metadata?.subaccountCode,
          }),
        });

        const data: any = await response.json();
        if (data.status && data.data) {
          return {
            authorizationUrl: data.data.authorization_url,
            accessCode: data.data.access_code,
            reference: params.reference,
            provider: 'paystack',
          };
        } else {
          this.logger.warn(`Paystack initialize returned status false: ${data.message || JSON.stringify(data)}`);
        }
      } catch (err: any) {
        this.logger.error(`Paystack initialize API error: ${err?.message}`);
      }
    }

    // Fallback URL if secret key is unconfigured or initialize failed
    return {
      authorizationUrl: `https://checkout.paystack.com/${encodeURIComponent(params.reference)}`,
      accessCode: `pstk_acc_${randomUUID().substring(0, 8)}`,
      reference: params.reference,
      provider: 'paystack',
    };
  }

  async verifyPayment(reference: string, customSecretKey?: string): Promise<VerifyPaymentResult> {
    const activeKey = customSecretKey || this.secretKey;
    const isRealKey = Boolean(
      activeKey &&
      !activeKey.includes('mock') &&
      (activeKey.startsWith('sk_live_') || activeKey.startsWith('sk_test_'))
    );

    if (isRealKey) {
      try {
        const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${activeKey}`,
          },
        });

        const data: any = await response.json();
        if (data.status && data.data) {
          const tx = data.data;
          const isSuccessful = tx.status === 'success';
          return {
            success: isSuccessful,
            reference: tx.reference || reference,
            amount: Number(tx.amount || 0) / 100, // convert kobo to NGN
            currency: tx.currency || 'NGN',
            status: isSuccessful ? 'successful' : tx.status === 'failed' ? 'failed' : 'abandoned',
            paidAt: tx.paid_at ? new Date(tx.paid_at) : undefined,
            channel: tx.channel,
            gatewayResponse: tx.gateway_response || data.message || 'Transaction processed',
            rawPayload: tx,
          };
        } else {
          return {
            success: false,
            reference,
            amount: 0,
            currency: 'NGN',
            status: 'failed',
            gatewayResponse: data?.message || 'Paystack payment verification unconfirmed',
            rawPayload: data,
          };
        }
      } catch (err: any) {
        this.logger.error(`Paystack verify API error: ${err?.message}`);
        return {
          success: false,
          reference,
          amount: 0,
          currency: 'NGN',
          status: 'failed',
          gatewayResponse: `Paystack API connection error: ${err?.message}`,
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
      gatewayResponse: 'Paystack secret key is not configured or invalid',
      rawPayload: null,
    };
  }

  async createDedicatedVirtualAccount(params: {
    customerEmail: string;
    customerName: string;
    reference: string;
    bvn?: string;
    bankCode?: string;
  }) {
    if (this.isConfiguredRealKey) {
      try {
        const response = await fetch('https://api.paystack.co/dedicated_account', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer: params.customerEmail,
            preferred_bank: params.bankCode || 'wema-bank',
          }),
        });

        const data: any = await response.json();
        if (data.status && data.data) {
          return {
            accountNumber: data.data.account_number,
            accountName: data.data.account_name,
            bankName: data.data.bank.name,
            bankCode: data.data.bank.slug,
            reference: params.reference,
            currency: 'NGN',
          };
        }
      } catch (err: any) {
        this.logger.error(`Paystack DVA error: ${err?.message}`);
        if (process.env.NODE_ENV === 'production') {
          throw new BadRequestException(`Paystack dedicated virtual account creation failed: ${err?.message}`);
        }
      }
    }

    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Dedicated Virtual Account creation requires active Paystack credentials in production.');
    }

    // Virtual NUBAN simulation for development / staging sandbox
    const mockNuban = `99${Math.floor(10000000 + Math.random() * 90000000)}`;
    return {
      accountNumber: mockNuban,
      accountName: `${params.customerName} (School Fees)`,
      bankName: 'Wema Bank (Paystack DVA Sandbox)',
      bankCode: '035',
      reference: params.reference,
      currency: 'NGN',
    };
  }

  verifyWebhookSignature(signature: string, rawBody: string | Buffer | any): boolean {
    if (!signature || typeof signature !== 'string') return false;
    const bodyStr =
      Buffer.isBuffer(rawBody)
        ? rawBody.toString('utf8')
        : typeof rawBody === 'string'
        ? rawBody
        : JSON.stringify(rawBody);

    const checkWithSecret = (secret: string) => {
      try {
        const hash = crypto.createHmac('sha512', secret).update(bodyStr).digest('hex');
        const hashBuf = Buffer.from(hash, 'utf8');
        const sigBuf = Buffer.from(signature, 'utf8');
        return hashBuf.length === sigBuf.length && crypto.timingSafeEqual(hashBuf, sigBuf);
      } catch {
        return false;
      }
    };

    if (checkWithSecret(this.webhookSecret)) return true;
    if (this.webhookSecret !== this.secretKey && checkWithSecret(this.secretKey)) return true;
    return false;
  }
}
