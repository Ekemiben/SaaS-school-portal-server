import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsNumber,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateVendorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'GENERAL',
    'EQUIPMENT',
    'UNIFORMS',
    'TEXTBOOKS',
    'LAB_SUPPLIES',
    'STATIONERY',
    'MAINTENANCE',
  ])
  category?: string;

  @IsString()
  @IsOptional()
  @IsIn(['IMMEDIATE', 'NET_15', 'NET_30', 'NET_60'])
  paymentTerms?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateVendorDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'GENERAL',
    'EQUIPMENT',
    'UNIFORMS',
    'TEXTBOOKS',
    'LAB_SUPPLIES',
    'STATIONERY',
    'MAINTENANCE',
  ])
  category?: string;

  @IsString()
  @IsOptional()
  @IsIn(['IMMEDIATE', 'NET_15', 'NET_30', 'NET_60'])
  paymentTerms?: string;

  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'BLACKLISTED'])
  status?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
