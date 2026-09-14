import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  IsIn,
} from 'class-validator';

export class CreateSyllabusTopicDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;

  @IsString()
  @IsOptional()
  termId?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  unitNumber: number = 1;

  @IsString()
  @IsNotEmpty()
  topicTitle!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  learningObjectives?: string[];

  @IsNumber()
  @IsOptional()
  estimatedHours?: number;

  @IsNumber()
  @IsOptional()
  weekNumber?: number;

  @IsNumber()
  @IsOptional()
  orderIndex: number = 0;

  @IsString()
  @IsOptional()
  @IsIn(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'])
  status: string = 'PLANNED';
}

export class UpdateSyllabusTopicDto {
  @IsString()
  @IsOptional()
  topicTitle?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  learningObjectives?: string[];

  @IsNumber()
  @IsOptional()
  estimatedHours?: number;

  @IsNumber()
  @IsOptional()
  weekNumber?: number;

  @IsNumber()
  @IsOptional()
  orderIndex?: number;

  @IsString()
  @IsOptional()
  @IsIn(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'])
  status?: string;
}

export class CompleteSyllabusTopicDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
