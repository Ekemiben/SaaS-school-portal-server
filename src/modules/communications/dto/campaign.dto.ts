import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ResolveAudienceDto } from './audience.dto.js';

export enum CampaignChannel {
  IN_APP = 'IN_APP',
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  SMS = 'SMS',
}

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIALLY_FAILED = 'PARTIALLY_FAILED',
  FAILED = 'FAILED',
}

export enum CampaignPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  EMERGENCY = 'EMERGENCY',
}

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsArray()
  @IsEnum(CampaignChannel, { each: true })
  @IsOptional()
  channels?: CampaignChannel[];

  @ValidateNested()
  @Type(() => ResolveAudienceDto)
  @IsNotEmpty()
  audience!: ResolveAudienceDto;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsOptional()
  templateVariables?: Record<string, any>;

  @IsEnum(CampaignPriority)
  @IsOptional()
  priority?: CampaignPriority;

  @IsBoolean()
  @IsOptional()
  sendImmediately?: boolean;

  @IsDateString()
  @IsOptional()
  scheduledFor?: string;

  @IsBoolean()
  @IsOptional()
  useFallback?: boolean;
}

export class CampaignFilterDto {
  @IsEnum(CampaignStatus)
  @IsOptional()
  status?: CampaignStatus;

  @IsEnum(CampaignChannel)
  @IsOptional()
  channel?: CampaignChannel;
}
