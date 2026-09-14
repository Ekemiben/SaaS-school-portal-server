import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FeeItemDto {
  @IsString()
  name!: string; // e.g. "Tuition Fee", "Science Laboratory Levy", "PTA Levy", "Uniform"

  @IsString()
  code!: string; // e.g. "TUI", "LAB", "PTA", "UNIFORM", "BUS"

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  category?: string; // "TUITION", "ACADEMIC", "LEVY", "FACILITY", "TRANSPORT", "BOARDING", "OTHER"

  @IsOptional()
  @IsBoolean()
  isOptional?: boolean; // false = mandatory, true = optional add-on

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateFeeStructureDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  campusId!: string;

  @IsString()
  academicYearId!: string;

  @IsOptional()
  @IsString()
  termId?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  applicableGradeLevel?: string;

  @IsOptional()
  @IsString()
  targetAudience?: string; // "ALL", "NEW_STUDENTS", "RETURNING_STUDENTS", "DAY_STUDENTS", "BOARDING_STUDENTS"

  @IsOptional()
  @IsString()
  currency?: string; // default "NGN" or "USD"

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  lateFeePercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lateFeeGraceDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  earlyBirdDiscountPercentage?: number;

  @IsOptional()
  @IsString()
  earlyBirdCutoffDate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeeItemDto)
  items!: FeeItemDto[];

  @IsOptional()
  @IsNumber()
  amount?: number;
}

export class UpdateFeeStructureDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  termId?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  applicableGradeLevel?: string;

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  lateFeePercentage?: number;

  @IsOptional()
  @IsNumber()
  lateFeeGraceDays?: number;

  @IsOptional()
  @IsNumber()
  earlyBirdDiscountPercentage?: number;

  @IsOptional()
  @IsString()
  earlyBirdCutoffDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeeItemDto)
  items?: FeeItemDto[];
}

export class EvaluateStudentFeeDto {
  @IsString()
  feeStructureId!: string;

  @IsString()
  studentId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedOptionalItemCodes?: string[];

  @IsOptional()
  @IsBoolean()
  isNewStudent?: boolean;

  @IsOptional()
  @IsBoolean()
  isBoardingStudent?: boolean;

  @IsOptional()
  @IsString()
  paymentDate?: string;

  @IsOptional()
  @IsNumber()
  waiverAmount?: number;
}
