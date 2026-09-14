export interface TransferRecipient {
  bankCode?: string;
  bankName?: string;
  accountNumber: string;
  accountName?: string;
}

export interface InitiateTransferParams {
  amount: number;
  currency: string;
  recipient: TransferRecipient;
  reference: string;
  reason?: string;
  tenantId: string;
  payrollId: string;
}

export type TransferStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REVERSED';

export interface InitiateTransferResult {
  transferCode: string;
  reference: string;
  status: TransferStatus;
  provider: 'paystack' | 'flutterwave';
  recipientCode?: string;
  rawResponse?: any;
}

export interface VerifyTransferResult {
  reference: string;
  status: TransferStatus;
  amount: number;
  currency: string;
  settledAt?: Date;
  gatewayResponse?: string;
  recipientAccount?: string;
  rawResponse?: any;
}

export interface DisbursementProviderAdapter {
  readonly name: string;
  initiateTransfer(params: InitiateTransferParams): Promise<InitiateTransferResult>;
  verifyTransfer(reference: string): Promise<VerifyTransferResult>;
  verifyWebhookSignature(signature: string, rawBody: string | Buffer): boolean;
}
