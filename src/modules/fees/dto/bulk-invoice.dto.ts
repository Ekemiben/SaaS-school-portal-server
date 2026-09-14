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

export class SiblingDiscountTierDto {
  @IsNumber()
  @Min(1)
  childIndex!: number; // 1 = 1st child, 2 = 2nd child, 3 = 3rd child, 4 = 4th+ child

  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage!: number; // e.g. 0, 10, 20, 30

  @IsOptional()
  @IsString()
  name?: string;
}

export class SiblingDiscountConfigDto {
  @IsBoolean()
  isEnabled!: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applyToCategories?: string[]; // default ["TUITION"]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SiblingDiscountTierDto)
  tiers!: SiblingDiscountTierDto[];
}

export class BulkGenerateInvoicesDto {
  @IsString()
  campusId!: string;

  @IsString()
  academicYearId!: string;

  @IsString()
  termId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  classIds?: string[];

  @IsOptional()
  @IsString()
  feeStructureId?: string;

  @IsString()
  dueDate!: string;

  @IsOptional()
  @IsBoolean()
  applySiblingDiscounts?: boolean;

  @IsOptional()
  @IsBoolean()
  applyScholarshipsAndWaivers?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyParents?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export interface BulkInvoicingResultDto {
  jobId: string;
  tenantId: string;
  campusId: string;
  academicYearId: string;
  termId: string;
  totalStudents: number;
  invoicesCreated: number;
  invoicesSkipped: number;
  totalSubtotal: number;
  totalDiscountAmount: number;
  totalWaiverAmount: number;
  totalBilledAmount: number;
  currency: string;
  dryRun: boolean;
  generatedAt: string;
  invoices: any[];
}
