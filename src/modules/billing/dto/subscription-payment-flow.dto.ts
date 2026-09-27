import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

export class InitializeSubscriptionPaymentDto {
  @IsString()
  @IsNotEmpty()
  planTier: string; // STARTER, STANDARD, PREMIUM, CUSTOM

  @IsString()
  @IsNotEmpty()
  billingCycle: string; // TERMLY, ANNUAL

  @IsString()
  @IsOptional()
  invoiceId?: string;

  @IsString()
  @IsOptional()
  callbackUrl?: string;
}

export class VerifySubscriptionPaymentDto {
  @IsString()
  @IsNotEmpty()
  reference: string;
}

export class InitiateBankTransferDto {
  @IsString()
  @IsNotEmpty()
  planTier: string;

  @IsString()
  @IsNotEmpty()
  billingCycle: string;

  @IsString()
  @IsOptional()
  invoiceId?: string;
}

export class SubmitBankTransferProofDto {
  @IsString()
  @IsOptional()
  paymentId?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsNotEmpty()
  senderBank: string;

  @IsString()
  @IsNotEmpty()
  senderAccountName: string;

  @IsString()
  @IsNotEmpty()
  transferDate: string;

  @IsString()
  @IsNotEmpty()
  transactionReference: string;

  @IsString()
  @IsOptional()
  proofUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class RecordManualPaymentDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  planTier: string;

  @IsString()
  @IsNotEmpty()
  billingCycle: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod: string; // BANK_TRANSFER, CASH, MANUAL, CHEQUE, DIRECT_DEBIT

  @IsString()
  @IsNotEmpty()
  reference: string;

  @IsString()
  @IsOptional()
  paymentDate?: string;

  @IsString()
  @IsNotEmpty()
  reason: string; // Required audit rationale

  @IsString()
  @IsOptional()
  notes?: string;
}
