import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
} from 'class-validator';
import { CampaignChannel } from './campaign.dto.js';

export enum TemplateCategory {
  FEE_REMINDER = 'FEE_REMINDER',
  ATTENDANCE_ALERT = 'ATTENDANCE_ALERT',
  RESULT_PUBLISHED = 'RESULT_PUBLISHED',
  HOMEWORK_NOTICE = 'HOMEWORK_NOTICE',
  EXAM_SCHEDULE = 'EXAM_SCHEDULE',
  TRANSPORT_ALERT = 'TRANSPORT_ALERT',
  EMERGENCY_ALERT = 'EMERGENCY_ALERT',
  GENERAL_ANNOUNCEMENT = 'GENERAL_ANNOUNCEMENT',
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(TemplateCategory)
  @IsNotEmpty()
  category!: TemplateCategory;

  @IsArray()
  @IsEnum(CampaignChannel, { each: true })
  @IsNotEmpty()
  channels!: CampaignChannel[];

  @IsString()
  @IsNotEmpty()
  subjectTemplate!: string;

  @IsString()
  @IsNotEmpty()
  bodyTemplate!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];
}

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(TemplateCategory)
  @IsOptional()
  category?: TemplateCategory;

  @IsArray()
  @IsEnum(CampaignChannel, { each: true })
  @IsOptional()
  channels?: CampaignChannel[];

  @IsString()
  @IsOptional()
  subjectTemplate?: string;

  @IsString()
  @IsOptional()
  bodyTemplate?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];
}
