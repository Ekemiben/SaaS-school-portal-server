import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class DisburseIndividualPayrollDto {
  @IsOptional()
  @IsString()
  provider?: 'paystack' | 'flutterwave';

  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkDisbursePayrollDto {
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @IsNumber()
  @Min(2000)
  year: number;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  provider?: 'paystack' | 'flutterwave';
}

export class HandleDisbursementWebhookDto {
  @IsString()
  event: string;

  data: any;
}
