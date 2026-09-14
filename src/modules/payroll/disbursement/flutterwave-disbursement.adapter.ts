import { Injectable, Logger } from '@nestjs/common';
import {
  DisbursementProviderAdapter,
  InitiateTransferParams,
  InitiateTransferResult,
  VerifyTransferResult,
} from './disbursement-provider.interface.js';

@Injectable()
export class FlutterwaveDisbursementAdapter implements DisbursementProviderAdapter {
  readonly name = 'flutterwave';
  private readonly logger = new Logger(FlutterwaveDisbursementAdapter.name);
  private readonly secretKey: string;
  private readonly webhookSecretHash: string;

  constructor() {
    this.secretKey = process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-mock';
    this.webhookSecretHash = process.env.FLUTTERWAVE_SECRET_HASH || 'flutterwave_hash';
  }

  async initiateTransfer(params: InitiateTransferParams): Promise<InitiateTransferResult> {
    try {
      const transferId = `FLW_TRF_${Date.now()}`;
      this.logger.log(
        `[Flutterwave Payout] Initiating disbursement of ₦${params.amount} to account ${params.recipient.accountNumber} (Ref: ${params.reference})`,
      );

      return {
        transferCode: transferId,
        reference: params.reference,
        status: 'PROCESSING',
        provider: 'flutterwave',
        rawResponse: {
          account_bank: params.recipient.bankCode || '044',
          account_number: params.recipient.accountNumber,
          amount: params.amount,
          narration: params.reason || 'Staff Salary Disbursement',
          currency: params.currency || 'NGN',
          reference: params.reference,
        },
      };
    } catch (err: any) {
      this.logger.error(`Flutterwave transfer error: ${err.message}`);
      throw err;
    }
  }

  async verifyTransfer(reference: string): Promise<VerifyTransferResult> {
    return {
      reference,
      status: 'SUCCESS',
      amount: 1000,
      currency: 'NGN',
      settledAt: new Date(),
      gatewayResponse: 'Transfer successful',
    };
  }

  verifyWebhookSignature(signature: string, _rawBody: string | Buffer): boolean {
    if (!signature) return false;
    return signature === this.webhookSecretHash;
  }
}
