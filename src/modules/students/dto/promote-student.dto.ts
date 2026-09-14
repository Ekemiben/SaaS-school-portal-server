import { IsString, IsNotEmpty, IsOptional, IsArray, IsIn, IsNumber, Min } from 'class-validator';

export class PromoteStudentDto {
  @IsNotEmpty()
  @IsString()
  targetAcademicYearId: string;

  @IsNotEmpty()
  @IsString()
  targetClassId: string;

  @IsOptional()
  @IsIn(['PROMOTED', 'REPEATED', 'ON_PROBATION', 'DOUBLE_PROMOTION'])
  promotionType?: string;

  @IsOptional()
  @IsString()
  rollNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PromotionStudentDecisionDto {
  @IsNotEmpty()
  @IsString()
  studentId: string;

  @IsNotEmpty()
  @IsIn(['PROMOTED', 'REPEATED', 'ON_PROBATION', 'WITHDRAWN', 'GRADUATED'])
  decision: string;

  @IsOptional()
  @IsString()
  targetClassId?: string;

  @IsOptional()
  @IsString()
  rollNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BatchPromoteClassDto {
  @IsNotEmpty()
  @IsString()
  sourceAcademicYearId: string;

  @IsNotEmpty()
  @IsString()
  targetAcademicYearId: string;

  @IsNotEmpty()
  @IsString()
  sourceClassId: string;

  @IsNotEmpty()
  @IsString()
  defaultTargetClassId: string;

  @IsOptional()
  @IsArray()
  studentDecisions?: PromotionStudentDecisionDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPassPercentage?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RevertPromotionBatchDto {
  @IsNotEmpty()
  @IsString()
  batchId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
