import {
  IsNumber,
  IsString,
  IsOptional,
  IsArray,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class GradeHomeworkDto {
  @IsNumber()
  @Min(0)
  score!: number;

  @IsString()
  @IsOptional()
  grade?: string;

  @IsString()
  @IsOptional()
  feedback?: string;

  @IsArray()
  @IsOptional()
  rubricScores?: Array<{
    criterionTitle: string;
    pointsAwarded: number;
    maxPoints: number;
    comment?: string;
  }>;

  @IsString()
  @IsOptional()
  @IsIn(['GRADED', 'RESUBMISSION_REQUESTED'])
  status: string = 'GRADED';
}

export class BulkGradeSubmissionDto {
  @IsArray()
  grades!: Array<{
    submissionId: string;
    score: number;
    grade?: string;
    feedback?: string;
  }>;
}
