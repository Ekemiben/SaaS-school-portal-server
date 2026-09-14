import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsIn } from 'class-validator';

export class SuspendStudentDto {
  @IsNotEmpty()
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class ReinstateStudentDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class WithdrawStudentDto {
  @IsNotEmpty()
  @IsIn(['RELOCATION', 'EXPULSION', 'FINANCIAL', 'MEDICAL', 'PERSONAL', 'OTHER'])
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class GraduateStudentDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(2000)
  graduationYear: number;

  @IsOptional()
  @IsNumber()
  finalCgpa?: number;

  @IsOptional()
  @IsString()
  honors?: string;

  @IsOptional()
  @IsString()
  certificateNumber?: string;

  @IsOptional()
  @IsString()
  alumniContactEmail?: string;

  @IsOptional()
  @IsString()
  alumniContactPhone?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AlumniFilterDto {
  @IsOptional()
  @IsNumber()
  graduationYear?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
