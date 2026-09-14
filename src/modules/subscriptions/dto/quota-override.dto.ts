import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';

export class QuotaOverrideDto {
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxStudents?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxCampuses?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxStaff?: number;

  @IsNumber()
  @IsOptional()
  @Min(100)
  storageLimitMb?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  messagingQuota?: number;

  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'ARCHIVED'])
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
