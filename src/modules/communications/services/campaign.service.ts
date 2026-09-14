import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { AudienceService } from './audience.service.js';
import { MessageTemplateService } from './message-template.service.js';
import { CommunicationPolicyService } from './communication-policy.service.js';
import { CommunicationWalletService } from './communication-wallet.service.js';
import { NotificationProcessor } from '../../../jobs/processors/notification.processor.js';
import {
  CreateCampaignDto,
  CampaignFilterDto,
  CampaignChannel,
  CampaignStatus,
  CampaignPriority,
} from '../dto/campaign.dto.js';
import { randomUUID } from 'crypto';

export interface ChannelDeliverySummary {
  channel: CampaignChannel;
  attempted: number;
  delivered: number;
  failed: number;
  cost: number;
  status: 'DELIVERED' | 'FAILED' | 'SKIPPED_INSUFFICIENT_BALANCE' | 'DISABLED';
  reason?: string;
}

export interface CampaignRecord {
  id: string;
  tenantId: string;
  authorId: string;
  title: string;
  content: string;
  channels: CampaignChannel[];
  priority: CampaignPriority;
  status: CampaignStatus;
  totalRecipients: number;
  deliveredCount: number;
  failedCount: number;
  totalCost: number;
  channelBreakdown: ChannelDeliverySummary[];
  createdAt: string;
}

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);
  private readonly fallbackCampaigns: CampaignRecord[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly audienceService: AudienceService,
    private readonly templateService: MessageTemplateService,
    private readonly policyService: CommunicationPolicyService,
    private readonly walletService: CommunicationWalletService,
    private readonly notificationProcessor: NotificationProcessor,
  ) {}

  async createAndDispatchCampaign(
    tenantId: string,
    authorId: string,
    dto: CreateCampaignDto,
  ): Promise<CampaignRecord> {
    const recipients = await this.audienceService.resolveAudience(tenantId, dto.audience);
    const settings = await this.policyService.getSettings(tenantId);
    const targetChannels = dto.channels && dto.channels.length > 0
      ? dto.channels
      : await this.policyService.resolveEffectiveChannels(tenantId, undefined, 'GENERAL');

    let content = dto.content;
    let title = dto.title;
    if (dto.templateId) {
      const tmpl = await this.templateService.getTemplateById(tenantId, dto.templateId);
      content = this.templateService.render(tmpl.bodyTemplate, dto.templateVariables || {});
      title = this.templateService.render(tmpl.subjectTemplate, dto.templateVariables || {});
    }

    const channelBreakdown: ChannelDeliverySummary[] = [];
    let totalCost = 0;
    let deliveredCount = 0;
    let failedCount = 0;

    for (const channel of targetChannels) {
      if (channel === CampaignChannel.IN_APP) {
        if (!settings.inAppEnabled) {
          channelBreakdown.push({ channel, attempted: recipients.length, delivered: 0, failed: 0, cost: 0, status: 'DISABLED' });
          continue;
        }
        for (const r of recipients) {
          const notifId = `notif_${randomUUID().replace(/-/g, '').substring(0, 8)}`;
          this.prisma.memoryStore.notifications.set(notifId, {
            id: notifId,
            tenantId,
            recipientUserId: r.userId || null,
            title,
            message: content,
            channel: 'IN_APP',
            status: 'SENT',
            sentAt: new Date(),
            createdAt: new Date(),
          });
        }
        deliveredCount += recipients.length;
        channelBreakdown.push({
          channel: CampaignChannel.IN_APP,
          attempted: recipients.length,
          delivered: recipients.length,
          failed: 0,
          cost: 0,
          status: 'DELIVERED',
        });
      } else if (channel === CampaignChannel.PUSH) {
        if (!settings.pushEnabled) {
          channelBreakdown.push({ channel, attempted: recipients.length, delivered: 0, failed: 0, cost: 0, status: 'DISABLED' });
          continue;
        }
        deliveredCount += recipients.length;
        channelBreakdown.push({
          channel: CampaignChannel.PUSH,
          attempted: recipients.length,
          delivered: recipients.length,
          failed: 0,
          cost: 0,
          status: 'DELIVERED',
        });
      } else if (channel === CampaignChannel.EMAIL) {
        if (!settings.emailEnabled) {
          channelBreakdown.push({ channel, attempted: recipients.length, delivered: 0, failed: 0, cost: 0, status: 'DISABLED' });
          continue;
        }
        const validEmails = recipients.filter((r) => !!r.email);
        for (const r of validEmails) {
          this.notificationProcessor.process({
            id: `job_email_${randomUUID().substring(0, 6)}`,
            data: {
              channel: 'email',
              tenantId,
              recipient: r.email!,
              subject: title,
              body: content,
            },
          }).catch(() => {});
        }
        deliveredCount += validEmails.length;
        channelBreakdown.push({
          channel: CampaignChannel.EMAIL,
          attempted: validEmails.length,
          delivered: validEmails.length,
          failed: recipients.length - validEmails.length,
          cost: 0,
          status: 'DELIVERED',
        });
      } else if (channel === CampaignChannel.SMS || channel === CampaignChannel.WHATSAPP) {
        const isEnabled = channel === CampaignChannel.SMS ? settings.smsEnabled : settings.whatsappEnabled;
        if (!isEnabled && !dto.channels?.includes(channel)) {
          channelBreakdown.push({ channel, attempted: recipients.length, delivered: 0, failed: 0, cost: 0, status: 'DISABLED' });
          continue;
        }

        const unitCost = channel === CampaignChannel.SMS ? settings.smsUnitCost : settings.whatsappUnitCost;
        const validPhones = recipients.filter((r) => !!r.phone);
        const requiredFunds = Number((Math.max(1, validPhones.length) * unitCost).toFixed(2));

        const debit = await this.walletService.debitWallet(
          tenantId,
          requiredFunds,
          channel,
          `Campaign dispatch: ${title}`,
        );

        if (debit.success) {
          totalCost += requiredFunds;
          for (const r of validPhones) {
            this.notificationProcessor.process({
              id: `job_${channel.toLowerCase()}_${randomUUID().substring(0, 6)}`,
              data: {
                channel: channel.toLowerCase() as any,
                tenantId,
                recipient: r.phone!,
                body: content,
              },
            }).catch(() => {});
          }
          deliveredCount += validPhones.length;
          channelBreakdown.push({
            channel,
            attempted: validPhones.length,
            delivered: validPhones.length,
            failed: recipients.length - validPhones.length,
            cost: requiredFunds,
            status: 'DELIVERED',
          });
        } else {
          failedCount += recipients.length;
          channelBreakdown.push({
            channel,
            attempted: recipients.length,
            delivered: 0,
            failed: recipients.length,
            cost: 0,
            status: 'SKIPPED_INSUFFICIENT_BALANCE',
            reason: debit.error || 'Insufficient communication balance',
          });
        }
      }
    }

    const campaign: CampaignRecord = {
      id: `cmp_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
      tenantId,
      authorId,
      title,
      content,
      channels: targetChannels,
      priority: dto.priority || CampaignPriority.NORMAL,
      status: failedCount > 0 && deliveredCount > 0 ? CampaignStatus.PARTIALLY_FAILED : CampaignStatus.COMPLETED,
      totalRecipients: recipients.length,
      deliveredCount,
      failedCount,
      totalCost,
      channelBreakdown,
      createdAt: new Date().toISOString(),
    };

    this.fallbackCampaigns.push(campaign);
    this.logger.log(`Created campaign ${campaign.id} for tenant ${tenantId}`);
    return campaign;
  }

  async listCampaigns(tenantId: string, filter?: CampaignFilterDto): Promise<CampaignRecord[]> {
    let results = this.fallbackCampaigns.filter((c) => c.tenantId === tenantId);
    if (filter?.status) {
      results = results.filter((c) => c.status === filter.status);
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getCampaignById(tenantId: string, id: string): Promise<CampaignRecord | null> {
    return this.fallbackCampaigns.find((c) => c.tenantId === tenantId && c.id === id) || null;
  }
}
