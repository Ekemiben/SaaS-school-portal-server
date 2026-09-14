import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PaystackPaymentAdapter } from '../../payments/adapters/paystack.adapter.js';
import { CommunicationWalletService } from './communication-wallet.service.js';
import { InitializeWalletTopUpDto } from '../dto/communication-wallet.dto.js';
import { randomUUID } from 'crypto';

export interface PendingCommunicationFundingRecord {
  id: string;
  tenantId: string;
  reference: string;
  amount: number;
  currency: string;
  customerEmail: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  createdAt: string;
}

@Injectable()
export class CommunicationPaystackService {
  private readonly logger = new Logger(CommunicationPaystackService.name);
  private readonly pendingFundings = new Map<string, PendingCommunicationFundingRecord>();

  constructor(
    private readonly paystackAdapter: PaystackPaymentAdapter,
    private readonly walletService: CommunicationWalletService,
  ) {}

  async initializeTopUp(
    tenantId: string,
    dto: InitializeWalletTopUpDto,
  ) {
    const reference = `COMM-FUND-${Date.now()}-${randomUUID().substring(0, 8).toUpperCase()}`;
    const email = dto.customerEmail || `admin@tenant-${tenantId.substring(0, 6)}.sch.ng`;
    const currency = dto.currency || 'NGN';

    const pendingRecord: PendingCommunicationFundingRecord = {
      id: `cfund_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
      tenantId,
      reference,
      amount: dto.amount,
      currency,
      customerEmail: email,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.pendingFundings.set(reference, pendingRecord);

    const initResult = await this.paystackAdapter.initializePayment({
      amount: dto.amount,
      currency,
      customerEmail: email,
      reference,
      callbackUrl: dto.callbackUrl,
      metadata: {
        domain: 'COMMUNICATION_WALLET',
        tenantId,
        fundingId: pendingRecord.id,
      },
    });

    this.logger.log(`Initialized communication wallet funding of ₦${dto.amount} (Ref: ${reference}) for tenant ${tenantId}`);

    return {
      reference,
      authorizationUrl: initResult.authorizationUrl,
      accessCode: initResult.accessCode,
      amount: dto.amount,
      currency,
    };
  }

  async verifyTopUp(
    tenantId: string,
    reference: string,
  ) {
    const pending = this.pendingFundings.get(reference);
    if (pending && pending.tenantId !== tenantId) {
      throw new BadRequestException('Payment reference does not belong to this tenant');
    }

    const verification = await this.paystackAdapter.verifyPayment(reference);
    if (!verification.success || verification.status !== 'successful') {
      if (pending) pending.status = 'FAILED';
      throw new BadRequestException('Paystack payment verification failed or uncompleted');
    }

    if (pending) pending.status = 'SUCCESSFUL';

    const amount = verification.amount || pending?.amount || 0;
    const creditResult = await this.walletService.creditWallet(
      tenantId,
      amount,
      reference,
      'Paystack Communication Wallet Funding',
      {
        provider: 'PAYSTACK',
        channel: verification.channel,
        paidAt: verification.paidAt,
      },
    );

    return {
      success: true,
      message: 'Communication wallet funded successfully',
      reference,
      amount,
      wallet: creditResult.wallet,
      transaction: creditResult.transaction,
    };
  }

  async handleWebhook(payload: any, signature: string) {
    const isValid = this.paystackAdapter.verifyWebhookSignature(signature, JSON.stringify(payload));
    if (!isValid) {
      throw new BadRequestException('Invalid cryptographic Paystack webhook signature');
    }

    const reference = payload?.data?.reference;
    if (!reference || !reference.startsWith('COMM-FUND-')) {
      return { received: true, message: 'Not a communication wallet funding reference' };
    }

    const tenantId = payload?.data?.metadata?.tenantId;
    if (!tenantId) {
      return { received: true, message: 'Missing tenantId in funding metadata' };
    }

    return this.verifyTopUp(tenantId, reference);
  }
}
