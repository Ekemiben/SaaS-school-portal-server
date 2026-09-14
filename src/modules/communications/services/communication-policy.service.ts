import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { UpdateCommunicationSettingsDto } from '../dto/communication-settings.dto.js';
import { CampaignChannel } from '../dto/campaign.dto.js';

export interface CommunicationSettings {
  tenantId: string;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  walletEnabled: boolean;
  monthlySpendingLimit: number;
  lowBalanceThreshold: number;
  autoTopUpEnabled: boolean;
  autoTopUpAmount?: number;
  smsUnitCost: number;
  whatsappUnitCost: number;
  feeReminderChannels: CampaignChannel[];
  attendanceAlertChannels: CampaignChannel[];
  resultsChannels: CampaignChannel[];
  homeworkChannels: CampaignChannel[];
  emergencyChannels: CampaignChannel[];
  transportChannels: CampaignChannel[];
  generalNoticeChannels: CampaignChannel[];
  updatedAt: string;
}

@Injectable()
export class CommunicationPolicyService {
  private readonly logger = new Logger(CommunicationPolicyService.name);
  private readonly fallbackSettings = new Map<string, CommunicationSettings>();

  constructor(private readonly prisma: PrismaService) {}

  private getDefaultSettings(tenantId: string): CommunicationSettings {
    return {
      tenantId,
      inAppEnabled: true,
      pushEnabled: true,
      emailEnabled: true,
      whatsappEnabled: false,
      smsEnabled: false,
      walletEnabled: false,
      monthlySpendingLimit: 50000,
      lowBalanceThreshold: 2000,
      autoTopUpEnabled: false,
      smsUnitCost: 4.0,
      whatsappUnitCost: 8.5,
      feeReminderChannels: [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.EMAIL],
      attendanceAlertChannels: [CampaignChannel.IN_APP, CampaignChannel.PUSH],
      resultsChannels: [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.EMAIL],
      homeworkChannels: [CampaignChannel.IN_APP, CampaignChannel.PUSH],
      emergencyChannels: [
        CampaignChannel.IN_APP,
        CampaignChannel.PUSH,
        CampaignChannel.EMAIL,
        CampaignChannel.WHATSAPP,
        CampaignChannel.SMS,
      ],
      transportChannels: [CampaignChannel.IN_APP, CampaignChannel.PUSH],
      generalNoticeChannels: [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.EMAIL],
      updatedAt: new Date().toISOString(),
    };
  }

  async getSettings(tenantId: string): Promise<CommunicationSettings> {
    const cached = this.fallbackSettings.get(tenantId);
    if (cached) return cached;

    const defaults = this.getDefaultSettings(tenantId);
    this.fallbackSettings.set(tenantId, defaults);
    return defaults;
  }

  async updateSettings(
    tenantId: string,
    dto: UpdateCommunicationSettingsDto,
  ): Promise<CommunicationSettings> {
    const current = await this.getSettings(tenantId);
    const updated: CommunicationSettings = {
      ...current,
      ...dto,
      updatedAt: new Date().toISOString(),
    };

    this.fallbackSettings.set(tenantId, updated);
    this.logger.log(`Updated communication settings for tenant ${tenantId}`);
    return updated;
  }

  async resolveEffectiveChannels(
    tenantId: string,
    requestedChannels?: CampaignChannel[],
    eventType?: 'FEE_REMINDER' | 'ATTENDANCE_ALERT' | 'RESULT_PUBLISHED' | 'EMERGENCY' | 'GENERAL',
  ): Promise<CampaignChannel[]> {
    const settings = await this.getSettings(tenantId);

    let candidates: CampaignChannel[] = [];
    if (requestedChannels && requestedChannels.length > 0) {
      candidates = requestedChannels;
    } else if (eventType) {
      switch (eventType) {
        case 'FEE_REMINDER':
          candidates = settings.feeReminderChannels;
          break;
        case 'ATTENDANCE_ALERT':
          candidates = settings.attendanceAlertChannels;
          break;
        case 'RESULT_PUBLISHED':
          candidates = settings.resultsChannels;
          break;
        case 'EMERGENCY':
          candidates = settings.emergencyChannels;
          break;
        default:
          candidates = settings.generalNoticeChannels;
          break;
      }
    } else {
      candidates = [CampaignChannel.IN_APP, CampaignChannel.PUSH];
    }

    // Filter by enabled channel switches in settings
    return candidates.filter((c) => {
      if (c === CampaignChannel.IN_APP) return settings.inAppEnabled !== false;
      if (c === CampaignChannel.PUSH) return settings.pushEnabled !== false;
      if (c === CampaignChannel.EMAIL) return settings.emailEnabled !== false;
      if (c === CampaignChannel.WHATSAPP) return settings.whatsappEnabled === true;
      if (c === CampaignChannel.SMS) return settings.smsEnabled === true;
      return true;
    });
  }
}
