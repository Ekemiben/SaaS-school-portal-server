import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsArray,
  IsEnum,
  Min,
} from 'class-validator';
import { CampaignChannel } from './campaign.dto.js';

export class UpdateCommunicationSettingsDto {
  @IsBoolean()
  @IsOptional()
  inAppEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  pushEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  emailEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  whatsappEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  smsEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  walletEnabled?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  monthlySpendingLimit?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  lowBalanceThreshold?: number;

  @IsBoolean()
  @IsOptional()
  autoTopUpEnabled?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  autoTopUpAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  smsUnitCost?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  whatsappUnitCost?: number;

  @IsArray()
  @IsEnum(CampaignChannel, { each: true })
  @IsOptional()
  feeReminderChannels?: CampaignChannel[];

  @IsArray()
  @IsEnum(CampaignChannel, { each: true })
  @IsOptional()
  attendanceAlertChannels?: CampaignChannel[];

  @IsArray()
  @IsEnum(CampaignChannel, { each: true })
  @IsOptional()
  resultsChannels?: CampaignChannel[];

  @IsArray()
  @IsEnum(CampaignChannel, { each: true })
  @IsOptional()
  homeworkChannels?: CampaignChannel[];

  @IsArray()
  @IsEnum(CampaignChannel, { each: true })
  @IsOptional()
  emergencyChannels?: CampaignChannel[];

  @IsArray()
  @IsEnum(CampaignChannel, { each: true })
  @IsOptional()
  transportChannels?: CampaignChannel[];

  @IsArray()
  @IsEnum(CampaignChannel, { each: true })
  @IsOptional()
  generalNoticeChannels?: CampaignChannel[];
}
