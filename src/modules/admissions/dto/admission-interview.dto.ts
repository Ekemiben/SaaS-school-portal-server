import { IsString, IsNotEmpty, IsOptional, IsDateString, IsIn, IsNumber, Min, Max } from 'class-validator';

export class ScheduleInterviewDto {
  @IsNotEmpty()
  @IsDateString()
  interviewDate: string;

  @IsOptional()
  @IsIn(['IN_PERSON', 'ONLINE', 'PHONE'])
  mode?: string;

  @IsNotEmpty()
  @IsString()
  interviewerUserId: string;

  @IsOptional()
  @IsString()
  interviewerName?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  meetingLink?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class EvaluateInterviewDto {
  @IsNotEmpty()
  @IsIn(['RECOMMENDED', 'NOT_RECOMMENDED', 'PENDING', 'RESCHEDULED'])
  outcome: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  @IsString()
  evaluationNotes?: string;
}
