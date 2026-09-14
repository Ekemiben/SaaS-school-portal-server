import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class UpsertStaffSalaryProfileDto {
  @IsString()
  staffUserId: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsNumber()
  @Min(0)
  basicSalary: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  housingAllowance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  transportAllowance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otherAllowances?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customDeductions?: number;

  @IsOptional()
  @IsBoolean()
  isPensionExempt?: boolean;

  @IsOptional()
  @IsBoolean()
  isNhfExempt?: boolean;

  @IsOptional()
  @IsBoolean()
  isNhisExempt?: boolean;

  @IsOptional()
  @IsBoolean()
  isTaxExempt?: boolean;

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
  @IsBoolean()
  isActive?: boolean;
}

export class GenerateBulkPayrollDto {
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
  @IsBoolean()
  overrideExisting?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkApprovePayrollDto {
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
}

export class QueryStaffSalaryProfilesDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
