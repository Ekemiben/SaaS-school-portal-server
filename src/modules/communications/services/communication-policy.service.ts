import { Injectable, Logger, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { UpdateCommunicationSettingsDto } from '../dto/communication-settings.dto.js';
import { CampaignChannel } from '../dto/campaign.dto.js';
import { randomUUID } from 'crypto';

export interface CommunicationSettingsRecord {
  id?: string;
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
  autoTopUpAmount?: number | null;
  smsUnitCost: number;
  whatsappUnitCost: number;
  feeReminderChannels: CampaignChannel[];
  attendanceAlertChannels: CampaignChannel[];
  resultsChannels: CampaignChannel[];
  homeworkChannels: CampaignChannel[];
  emergencyChannels: CampaignChannel[];
  transportChannels: CampaignChannel[];
  generalNoticeChannels: CampaignChannel[];
  createdAt?: string;
  updatedAt: string;
}

@Injectable()
export class CommunicationPolicyService {
  private readonly logger = new Logger(CommunicationPolicyService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  private getDefaultSettings(tenantId: string): CommunicationSettingsRecord {
    const now = new Date().toISOString();
    return {
      id: `cset_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
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
      autoTopUpAmount: null,
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
      createdAt: now,
      updatedAt: now,
    };
  }

  async getSettings(tenantId: string): Promise<CommunicationSettingsRecord> {
    if (this.prisma?.isDbConnected) {
      try {
        let settings = await this.prisma.communicationSettings.findUnique({
          where: { tenantId },
        });

        if (!settings) {
          const defaults = this.getDefaultSettings(tenantId);
          settings = await this.prisma.communicationSettings.create({
            data: {
              id: defaults.id,
              tenantId,
              inAppEnabled: defaults.inAppEnabled,
              pushEnabled: defaults.pushEnabled,
              emailEnabled: defaults.emailEnabled,
              whatsappEnabled: defaults.whatsappEnabled,
              smsEnabled: defaults.smsEnabled,
              walletEnabled: defaults.walletEnabled,
              monthlySpendingLimit: defaults.monthlySpendingLimit,
              lowBalanceThreshold: defaults.lowBalanceThreshold,
              autoTopUpEnabled: defaults.autoTopUpEnabled,
              autoTopUpAmount: defaults.autoTopUpAmount,
              smsUnitCost: defaults.smsUnitCost,
              whatsappUnitCost: defaults.whatsappUnitCost,
              feeReminderChannels: defaults.feeReminderChannels as any,
              attendanceAlertChannels: defaults.attendanceAlertChannels as any,
              resultsChannels: defaults.resultsChannels as any,
              homeworkChannels: defaults.homeworkChannels as any,
              emergencyChannels: defaults.emergencyChannels as any,
              transportChannels: defaults.transportChannels as any,
              generalNoticeChannels: defaults.generalNoticeChannels as any,
            },
          });
        }

        const record: CommunicationSettingsRecord = {
          id: settings.id,
          tenantId: settings.tenantId,
          inAppEnabled: settings.inAppEnabled,
          pushEnabled: settings.pushEnabled,
          emailEnabled: settings.emailEnabled,
          whatsappEnabled: settings.whatsappEnabled,
          smsEnabled: settings.smsEnabled,
          walletEnabled: settings.walletEnabled,
          monthlySpendingLimit: Number(settings.monthlySpendingLimit),
          lowBalanceThreshold: Number(settings.lowBalanceThreshold),
          autoTopUpEnabled: settings.autoTopUpEnabled,
          autoTopUpAmount: settings.autoTopUpAmount ? Number(settings.autoTopUpAmount) : null,
          smsUnitCost: Number(settings.smsUnitCost),
          whatsappUnitCost: Number(settings.whatsappUnitCost),
          feeReminderChannels: (settings.feeReminderChannels as any) || [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.EMAIL],
          attendanceAlertChannels: (settings.attendanceAlertChannels as any) || [CampaignChannel.IN_APP, CampaignChannel.PUSH],
          resultsChannels: (settings.resultsChannels as any) || [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.EMAIL],
          homeworkChannels: (settings.homeworkChannels as any) || [CampaignChannel.IN_APP, CampaignChannel.PUSH],
          emergencyChannels: (settings.emergencyChannels as any) || [
            CampaignChannel.IN_APP,
            CampaignChannel.PUSH,
            CampaignChannel.EMAIL,
            CampaignChannel.WHATSAPP,
            CampaignChannel.SMS,
          ],
          transportChannels: (settings.transportChannels as any) || [CampaignChannel.IN_APP, CampaignChannel.PUSH],
          generalNoticeChannels: (settings.generalNoticeChannels as any) || [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.EMAIL],
          createdAt: settings.createdAt.toISOString(),
          updatedAt: settings.updatedAt.toISOString(),
        };

        this.prisma.memoryStore.communicationSettings.set(tenantId, record);
        return record;
      } catch (err: any) {
        this.logger.warn(`Could not load settings from DB: ${err.message}`);
      }
    }

    // Memory Store fallback
    let mem = this.prisma?.memoryStore?.communicationSettings?.get(tenantId);
    if (!mem) {
      mem = this.getDefaultSettings(tenantId);
      this.prisma?.memoryStore?.communicationSettings?.set(tenantId, mem);
    }
    return mem;
  }

  async updateSettings(
    tenantId: string,
    dto: UpdateCommunicationSettingsDto,
  ): Promise<CommunicationSettingsRecord> {
    const current = await this.getSettings(tenantId);
    const now = new Date();

    const updated: CommunicationSettingsRecord = {
      ...current,
      ...dto,
      monthlySpendingLimit: dto.monthlySpendingLimit !== undefined ? dto.monthlySpendingLimit : current.monthlySpendingLimit,
      lowBalanceThreshold: dto.lowBalanceThreshold !== undefined ? dto.lowBalanceThreshold : current.lowBalanceThreshold,
      autoTopUpAmount: dto.autoTopUpAmount !== undefined ? dto.autoTopUpAmount : current.autoTopUpAmount,
      smsUnitCost: dto.smsUnitCost !== undefined ? dto.smsUnitCost : current.smsUnitCost,
      whatsappUnitCost: dto.whatsappUnitCost !== undefined ? dto.whatsappUnitCost : current.whatsappUnitCost,
      updatedAt: now.toISOString(),
    };

    if (this.prisma?.isDbConnected) {
      try {
        await this.prisma.communicationSettings.upsert({
          where: { tenantId },
          create: {
            id: `cset_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
            tenantId,
            inAppEnabled: updated.inAppEnabled,
            pushEnabled: updated.pushEnabled,
            emailEnabled: updated.emailEnabled,
            whatsappEnabled: updated.whatsappEnabled,
            smsEnabled: updated.smsEnabled,
            walletEnabled: updated.walletEnabled,
            monthlySpendingLimit: updated.monthlySpendingLimit,
            lowBalanceThreshold: updated.lowBalanceThreshold,
            autoTopUpEnabled: updated.autoTopUpEnabled,
            autoTopUpAmount: updated.autoTopUpAmount,
            smsUnitCost: updated.smsUnitCost,
            whatsappUnitCost: updated.whatsappUnitCost,
            feeReminderChannels: updated.feeReminderChannels as any,
            attendanceAlertChannels: updated.attendanceAlertChannels as any,
            resultsChannels: updated.resultsChannels as any,
            homeworkChannels: updated.homeworkChannels as any,
            emergencyChannels: updated.emergencyChannels as any,
            transportChannels: updated.transportChannels as any,
            generalNoticeChannels: updated.generalNoticeChannels as any,
            createdAt: now,
            updatedAt: now,
          },
          update: {
            inAppEnabled: updated.inAppEnabled,
            pushEnabled: updated.pushEnabled,
            emailEnabled: updated.emailEnabled,
            whatsappEnabled: updated.whatsappEnabled,
            smsEnabled: updated.smsEnabled,
            walletEnabled: updated.walletEnabled,
            monthlySpendingLimit: updated.monthlySpendingLimit,
            lowBalanceThreshold: updated.lowBalanceThreshold,
            autoTopUpEnabled: updated.autoTopUpEnabled,
            autoTopUpAmount: updated.autoTopUpAmount,
            smsUnitCost: updated.smsUnitCost,
            whatsappUnitCost: updated.whatsappUnitCost,
            feeReminderChannels: updated.feeReminderChannels as any,
            attendanceAlertChannels: updated.attendanceAlertChannels as any,
            resultsChannels: updated.resultsChannels as any,
            homeworkChannels: updated.homeworkChannels as any,
            emergencyChannels: updated.emergencyChannels as any,
            transportChannels: updated.transportChannels as any,
            generalNoticeChannels: updated.generalNoticeChannels as any,
            updatedAt: now,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not update settings in DB: ${err.message}`);
      }
    }

    this.prisma?.memoryStore?.communicationSettings?.set(tenantId, updated);
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

    // Filter by enabled channel master switches in settings
    return candidates.filter((c) => {
      if (c === CampaignChannel.IN_APP) return settings.inAppEnabled !== false;
      if (c === CampaignChannel.PUSH) return settings.pushEnabled !== false;
      if (c === CampaignChannel.EMAIL) return settings.emailEnabled !== false;
      if (c === CampaignChannel.WHATSAPP) return settings.whatsappEnabled === true;
      if (c === CampaignChannel.SMS) return settings.smsEnabled === true;
      return true;
    });
  }

  async resetDefaultSettings(tenantId: string): Promise<CommunicationSettingsRecord> {
    const defaults = this.getDefaultSettings(tenantId);
    return this.updateSettings(tenantId, {
      ...defaults,
      autoTopUpAmount: defaults.autoTopUpAmount ?? undefined,
    });
  }
}
