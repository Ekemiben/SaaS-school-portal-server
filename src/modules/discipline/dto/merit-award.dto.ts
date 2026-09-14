import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateMeritAwardDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsOptional()
  classId?: string;

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
  @IsIn([
    'ACADEMIC_EXCELLENCE',
    'OUTSTANDING_EFFORT',
    'LEADERSHIP',
    'SPORTSMANSHIP',
    'COMMUNITY_SERVICE',
    'CIVIC_RESPONSIBILITY',
    'PEER_SUPPORT',
    'INTEGRITY',
    'PERFECT_ATTENDANCE',
  ])
  category!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
  meritPoints: number = 1;

  @IsString()
  @IsOptional()
  @IsIn(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'STAR_OF_THE_MONTH'])
  badgeTier?: string;

  @IsDateString()
  @IsOptional()
  awardDate?: string;

  @IsString()
  @IsOptional()
  citationNotes?: string;
}

export class MeritFilterDto {
  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  badgeTier?: string;
}
