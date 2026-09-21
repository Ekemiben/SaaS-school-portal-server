import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsBoolean,
  Min,
  Max,
  IsEmail,
} from 'class-validator';

export enum PaymentGatewayProvider {
  PAYSTACK = 'PAYSTACK',
  FLUTTERWAVE = 'FLUTTERWAVE',
  MANUAL = 'MANUAL',
}

export enum PaymentChannel {
  CARD = 'CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  USSD = 'USSD',
  QR = 'QR',
  MANUAL_BANK_DEPOSIT = 'MANUAL_BANK_DEPOSIT',
}

export class InitializePaymentDto {
  @IsString()
  invoiceId!: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(PaymentGatewayProvider)
  provider?: PaymentGatewayProvider;

  @IsOptional()
  @IsEnum(PaymentChannel)
  channel?: PaymentChannel;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @IsOptional()
  @IsString()
  subaccountCode?: string;
}

export class CreateVirtualAccountDto {
  @IsString()
  invoiceId!: string;

  @IsString()
  studentId!: string;

  @IsEmail()
  customerEmail!: string;

  @IsString()
  customerName!: string;

  @IsOptional()
  @IsString()
  bvn?: string;

  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsEnum(PaymentGatewayProvider)
  provider?: PaymentGatewayProvider;
}

export class TenantPaymentConfigDto {
  @IsEnum(PaymentGatewayProvider)
  defaultProvider!: PaymentGatewayProvider;

  @IsOptional()
  @IsString()
  subaccountCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  splitPercentage?: number; // e.g. 100 for 100% to school subaccount

  @IsOptional()
  @IsString()
  bearer?: 'account' | 'subaccount' | 'all-proportional';

  @IsOptional()
  @IsBoolean()
  enableVirtualAccounts?: boolean;

  @IsOptional()
  @IsBoolean()
  enableCardPayments?: boolean;
}

export class RefundPaymentDto {
  @IsString()
  reason!: string;
}

export interface VirtualAccountResultDto {
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode: string;
  reference: string;
  currency: string;
  expiresAt?: string;
  invoiceId: string;
}
