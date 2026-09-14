import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class CalculateSalaryDto {
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
  bonus?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customDeductions?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lifeAssurance?: number;

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
}

export class GenerateStaffPayrollDto extends CalculateSalaryDto {
  @IsString()
  staffUserId: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @IsNumber()
  @Min(2000)
  year: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryPayrollDto {
  @IsOptional()
  @IsNumber()
  month?: number;

  @IsOptional()
  @IsNumber()
  year?: number;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  staffUserId?: string;
}
