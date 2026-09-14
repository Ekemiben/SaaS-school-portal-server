import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class PayLibraryFineDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  paymentReference?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class WaiveLibraryFineDto {
  @IsString()
  @IsNotEmpty()
  waiveReason!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
