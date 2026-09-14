import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ScreeningType {
  ANNUAL_GENERAL_CHECKUP = 'ANNUAL_GENERAL_CHECKUP',
  VISION_ACUITY = 'VISION_ACUITY',
  HEARING_AUDIOMETRY = 'HEARING_AUDIOMETRY',
  DENTAL_ORAL_HEALTH = 'DENTAL_ORAL_HEALTH',
  NUTRITION_BMI = 'NUTRITION_BMI',
  INFECTIOUS_DISEASE_SCREENING = 'INFECTIOUS_DISEASE_SCREENING',
}

export enum ScreeningOutcome {
  NORMAL_CLEAR = 'NORMAL_CLEAR',
  MINOR_OBSERVATION = 'MINOR_OBSERVATION',
  FOLLOW_UP_REQUIRED = 'FOLLOW_UP_REQUIRED',
  URGENT_REFERRAL = 'URGENT_REFERRAL',
}

export class RecordHealthScreeningDto {
  @IsUUID()
  @IsNotEmpty()
  studentId!: string;

  @IsEnum(ScreeningType)
  @IsNotEmpty()
  screeningType!: ScreeningType;

  @IsEnum(ScreeningOutcome)
  @IsNotEmpty()
  outcome!: ScreeningOutcome;

  @IsString()
  @IsNotEmpty()
  screenerName!: string;

  @IsString()
  @IsNotEmpty()
  screenerDesignation!: string;

  @IsDateString()
  @IsNotEmpty()
  screeningDate!: string;

  @IsString()
  @IsNotEmpty()
  findings!: string;

  @IsBoolean()
  @IsOptional()
  referralRecommended?: boolean;

  @IsString()
  @IsOptional()
  referralDestination?: string;

  @IsDateString()
  @IsOptional()
  followUpDueDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class BatchScreeningDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  studentIds!: string[];

  @ValidateNested()
  @Type(() => RecordHealthScreeningDto)
  @IsNotEmpty()
  screeningTemplate!: RecordHealthScreeningDto;
}

export class HealthScreeningFilterDto {
  @IsUUID()
  @IsOptional()
  studentId?: string;

  @IsEnum(ScreeningType)
  @IsOptional()
  screeningType?: ScreeningType;

  @IsEnum(ScreeningOutcome)
  @IsOptional()
  outcome?: ScreeningOutcome;
}
