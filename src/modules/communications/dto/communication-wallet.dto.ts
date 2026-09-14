import {
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  Min,
  IsDateString,
} from 'class-validator';

export enum WalletTransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum WalletTransactionStatus {
  PENDING = 'PENDING',
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED',
}

export class InitializeWalletTopUpDto {
  @IsNumber()
  @Min(500)
  @IsNotEmpty()
  amount!: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  callbackUrl?: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;
}

export class WalletTransactionFilterDto {
  @IsEnum(WalletTransactionType)
  @IsOptional()
  type?: WalletTransactionType;

  @IsEnum(WalletTransactionStatus)
  @IsOptional()
  status?: WalletTransactionStatus;

  @IsString()
  @IsOptional()
  channel?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
