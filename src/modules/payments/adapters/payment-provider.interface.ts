export interface InitializePaymentParams {
  amount: number;
  currency: string;
  customerEmail: string;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface InitializePaymentResult {
  authorizationUrl: string;
  accessCode?: string;
  reference: string;
  provider: 'paystack' | 'flutterwave';
}

export interface VerifyPaymentResult {
  success: boolean;
  reference: string;
  amount: number;
  currency: string;
  status: 'successful' | 'failed' | 'abandoned';
  paidAt?: Date;
  channel?: string;
  gatewayResponse?: string;
  rawPayload?: any;
}

export interface PaymentProviderAdapter {
  readonly name: string;
  initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult>;
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;
  verifyWebhookSignature(signature: string, rawBody: string | Buffer): boolean;
}
