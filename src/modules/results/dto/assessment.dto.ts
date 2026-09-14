import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AssessmentComponentDto {
  @IsString()
  code!: string; // e.g. "CA1", "CA2", "MIDTERM", "EXAM"

  @IsString()
  name!: string; // e.g. "Continuous Assessment 1"

  @IsNumber()
  @Min(1)
  maxScore!: number; // Raw maximum score e.g. 20, 40, 100

  @IsNumber()
  @Min(0)
  @Max(100)
  weight!: number; // Weight percentage e.g. 10, 20, 60

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateAssessmentStructureDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssessmentComponentDto)
  components!: AssessmentComponentDto[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  totalWeight?: number;
}

export class UpdateAssessmentStructureDto {
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
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssessmentComponentDto)
  components?: AssessmentComponentDto[];
}

export class GradingRuleDto {
  @IsString()
  grade!: string; // e.g. "A1", "B2", "C4", "F9"

  @IsNumber()
  @Min(0)
  minScore!: number; // e.g. 75

  @IsNumber()
  @Max(100)
  maxScore!: number; // e.g. 100

  @IsNumber()
  @Min(0)
  gradePoint!: number; // e.g. 4.0, 3.5

  @IsOptional()
  @IsString()
  remark?: string; // e.g. "Distinction", "Excellent"
}

export class EnterWeightedScoreDto {
  @IsString()
  examinationId!: string;

  @IsString()
  studentId!: string;

  @IsString()
  subjectId!: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  assessmentStructureId?: string;

  @IsObject()
  componentScores!: Record<string, number>; // e.g. { "CA1": 18, "CA2": 19, "EXAM": 55 }

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkScoreEntryItemDto {
  @IsString()
  studentId!: string;

  @IsObject()
  componentScores!: Record<string, number>;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkEnterWeightedScoresDto {
  @IsString()
  examinationId!: string;

  @IsString()
  subjectId!: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  assessmentStructureId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkScoreEntryItemDto)
  entries!: BulkScoreEntryItemDto[];
}

export class EvaluateAssessmentDto {
  @IsOptional()
  @IsString()
  assessmentStructureId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssessmentComponentDto)
  components?: AssessmentComponentDto[];

  @IsObject()
  componentScores!: Record<string, number>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradingRuleDto)
  gradingScaleRules?: GradingRuleDto[];
}
