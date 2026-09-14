import { IsString, IsNotEmpty, IsOptional, IsDateString, IsIn, IsNumber, Min, Max } from 'class-validator';

export class ScheduleScreeningDto {
  @IsNotEmpty()
  @IsDateString()
  screeningDate: string;

  @IsOptional()
  @IsIn(['IN_PERSON', 'ONLINE', 'HYBRID'])
  mode?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  reviewerUserId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordScreeningOutcomeDto {
  @IsNotEmpty()
  @IsIn(['PASSED', 'FAILED', 'RESCHEDULED', 'PENDING'])
  outcome: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;
}

export class ScheduleEntranceTestDto {
  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsNotEmpty()
  @IsDateString()
  testDate: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  passMark?: number;

  @IsOptional()
  @IsString()
  examinerUserId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordEntranceTestScoreDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  scoreObtained: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
