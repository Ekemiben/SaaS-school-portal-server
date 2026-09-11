import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, Min, Max } from 'class-validator';

export class CreateHomeworkDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

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
  maxMarks!: number;

  @IsString()
  @IsOptional()
  attachmentKey?: string;
}

export class SubmitHomeworkDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsOptional()
  submissionText?: string;

  @IsString()
  @IsOptional()
  attachmentKey?: string;
}

export class GradeHomeworkDto {
  @IsNumber()
  @Min(0)
  score!: number;

  @IsString()
  @IsOptional()
  feedback?: string;
}
