import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  IsBoolean,
  IsArray,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateHomeworkDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;

  @IsString()
  @IsOptional()
  termId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate!: string;

  @IsNumber()
  @Min(1)
  @Max(1000)
  @IsOptional()
  maxMarks: number = 100;

  @IsNumber()
  @Min(0)
  @Max(1000)
  @IsOptional()
  passingMarks?: number;

  @IsBoolean()
  @IsOptional()
  allowLateSubmissions: boolean = true;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  latePenaltyPercent?: number;

  @IsString()
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'])
  status: string = 'PUBLISHED';

  @IsArray()
  @IsOptional()
  attachments?: Array<{
    fileAssetId?: string;
    url: string;
    name: string;
    sizeBytes?: number;
    mimeType?: string;
  }>;

  @IsArray()
  @IsOptional()
  rubricCriteria?: Array<{
    title: string;
    description?: string;
    maxPoints: number;
  }>;

  @IsString()
  @IsOptional()
  @IsIn(['ALL', 'SELECTED_STUDENTS'])
  targetGroup: string = 'ALL';

  @IsArray()
  @IsOptional()
  selectedStudentIds?: string[];

  // Backwards compatibility legacy field
  @IsString()
  @IsOptional()
  attachmentKey?: string;
}

export class UpdateHomeworkDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsNumber()
  @Min(1)
  @Max(1000)
  @IsOptional()
  maxMarks?: number;

  @IsNumber()
  @Min(0)
  @Max(1000)
  @IsOptional()
  passingMarks?: number;

  @IsBoolean()
  @IsOptional()
  allowLateSubmissions?: boolean;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  latePenaltyPercent?: number;

  @IsString()
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'])
  status?: string;

  @IsArray()
  @IsOptional()
  attachments?: Array<{
    fileAssetId?: string;
    url: string;
    name: string;
    sizeBytes?: number;
    mimeType?: string;
  }>;

  @IsArray()
  @IsOptional()
  rubricCriteria?: Array<{
    title: string;
    description?: string;
    maxPoints: number;
  }>;
}

export class HomeworkFilterDto {
  @IsString()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  subjectId?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;

  @IsString()
  @IsOptional()
  termId?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

// Re-exports for backwards compatibility
export { SubmitHomeworkDto } from './submit-homework.dto.js';
export { GradeHomeworkDto } from './grade-homework.dto.js';
