import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class PayBillingInvoiceDto {
  @IsString()
  @IsNotEmpty()
  paymentMethod: string; // CARD, BANK_TRANSFER, MANUAL, PAYSTACK, FLUTTERWAVE

  @IsString()
  @IsOptional()
  paymentReference?: string;
}
