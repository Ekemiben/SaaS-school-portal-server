import { Injectable, Logger, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { AudienceService } from './audience.service.js';
import { MessageTemplateService } from './message-template.service.js';
import { CommunicationPolicyService } from './communication-policy.service.js';
import { CommunicationWalletService } from './communication-wallet.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
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
  status: 'DELIVERED' | 'FAILED' | 'PARTIALLY_FAILED' | 'SKIPPED_INSUFFICIENT_BALANCE' | 'DISABLED';
  reason?: string;
}

export interface CampaignRecord {
  id: string;
  tenantId: string;
  authorId: string;
  templateId?: string | null;
  title: string;
  content: string;
  subject?: string | null;
  channels: CampaignChannel[];
  audienceType: string;
  audienceCriteria?: any;
  priority: CampaignPriority;
  status: CampaignStatus;
  scheduledAt?: string | null;
  totalRecipients: number;
  deliveredCount: number;
  failedCount: number;
  totalCost: number;
  channelBreakdown: ChannelDeliverySummary[];
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipientLogRecord {
  id: string;
  tenantId: string;
  campaignId?: string | null;
  recipientUserId?: string | null;
  recipientType: string;
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  channel: CampaignChannel;
  messageContent: string;
  cost: number;
  status: 'QUEUED' | 'PROCESSING' | 'SIMULATED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED';
  providerId?: string | null;
  failureReason?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audienceService: AudienceService,
    private readonly templateService: MessageTemplateService,
    private readonly policyService: CommunicationPolicyService,
    private readonly walletService: CommunicationWalletService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly notificationProcessor?: NotificationProcessor,
  ) {}

  async createAndDispatchCampaign(
    tenantId: string,
    authorId: string,
    dto: CreateCampaignDto,
  ): Promise<CampaignRecord> {
    const recipients = await this.audienceService.resolveAudience(tenantId, dto.audience);
    const settings = await this.policyService.getSettings(tenantId);
    const targetChannels: CampaignChannel[] =
      dto.channels && dto.channels.length > 0
        ? dto.channels
        : await this.policyService.resolveEffectiveChannels(tenantId, undefined, 'GENERAL');

    let defaultContent = dto.content;
    let defaultTitle = dto.title;
    let template: any = null;

    if (dto.templateId) {
      template = await this.templateService.getTemplateById(tenantId, dto.templateId);
      if (template) {
        defaultContent = this.templateService.render(template.bodyTemplate, dto.templateVariables || {});
        defaultTitle = this.templateService.render(template.subjectTemplate, dto.templateVariables || {});
      }
    }

    const campaignId = `cmp_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const now = new Date();
    const scheduledDate = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    const isScheduled = dto.sendImmediately === false || (scheduledDate && scheduledDate > now);

    if (isScheduled) {
      let dbTemplateId: string | null = null;
      if (dto.templateId) {
        const tmplExists = await this.prisma.messageTemplate.findUnique({
          where: { id: dto.templateId },
        });
        if (tmplExists) dbTemplateId = tmplExists.id;
      }

      await this.prisma.communicationCampaign.create({
        data: {
          id: campaignId,
          tenantId,
          authorId,
          templateId: dbTemplateId,
          title: defaultTitle,
          content: defaultContent,
          subject: defaultTitle,
          channels: targetChannels as any,
          audienceType: dto.audience.audienceType,
          audienceCriteria: dto.audience as any,
          priority: dto.priority || CampaignPriority.NORMAL,
          status: CampaignStatus.SCHEDULED,
          scheduledAt: scheduledDate,
          totalRecipients: recipients.length,
          deliveredCount: 0,
          failedCount: 0,
          totalCost: 0,
          channelBreakdown: [] as any,
          completedAt: null,
        },
      });

      this.logger.log(`Scheduled campaign ${campaignId} for tenant ${tenantId} at ${scheduledDate?.toISOString()}`);
      const created = await this.getCampaignById(tenantId, campaignId);
      return created!;
    }

    // Immediate Execution Lifecycle
    const channelBreakdown: ChannelDeliverySummary[] = [];
    const recipientLogs: RecipientLogRecord[] = [];
    let totalCost = 0;
    let totalDelivered = 0;
    let totalFailed = 0;

    for (const channel of targetChannels) {
      if (channel === CampaignChannel.IN_APP) {
        if (!settings.inAppEnabled) {
          channelBreakdown.push({
            channel,
            attempted: recipients.length,
            delivered: 0,
            failed: 0,
            cost: 0,
            status: 'DISABLED',
            reason: 'In-app notifications are disabled in communication settings',
          });
          for (const r of recipients) {
            recipientLogs.push({
              id: `crl_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
              tenantId,
              campaignId,
              recipientUserId: r.userId || null,
              recipientType: r.role || 'PARENT',
              recipientName: r.name,
              recipientPhone: r.phone || null,
              recipientEmail: r.email || null,
              channel: CampaignChannel.IN_APP,
              messageContent: defaultContent,
              cost: 0,
              status: 'SKIPPED',
              failureReason: 'In-app notifications are disabled in communication settings',
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            });
          }
          continue;
        }

        const validUserRecipients = recipients.filter((r) => !!r.userId);
        const inboxBatch = validUserRecipients.map((r) => {
          const personalizedVars = {
            parentName: r.name,
            recipientName: r.name,
            studentName: r.studentName || r.name,
            amount: r.balanceAmount !== undefined ? r.balanceAmount : '',
            balance: r.balanceAmount !== undefined ? r.balanceAmount : '',
            ...dto.templateVariables,
          };
          const msgBody = template
            ? this.templateService.render(template.bodyTemplate, personalizedVars)
            : defaultContent;
          const msgTitle = template
            ? this.templateService.render(template.subjectTemplate, personalizedVars)
            : defaultTitle;

          return {
            recipientUserId: r.userId!,
            title: msgTitle,
            message: msgBody,
            priority: (dto.priority || 'NORMAL') as any,
            category: 'ANNOUNCEMENT' as const,
            campaignId,
          };
        });

        if (inboxBatch.length > 0) {
          if (this.notificationsService && typeof this.notificationsService.createBatchInboxItems === 'function') {
            await this.notificationsService.createBatchInboxItems(tenantId, inboxBatch);
          } else {
            for (const item of inboxBatch) {
              const id = `inb_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
              await this.prisma.inAppInboxItem.create({
                data: {
                  id,
                  tenantId,
                  recipientUserId: item.recipientUserId,
                  title: item.title,
                  message: item.message,
                  priority: item.priority || 'NORMAL',
                  category: item.category || 'ANNOUNCEMENT',
                  actionUrl: null,
                  isRead: false,
                  readAt: null,
                  campaignId: item.campaignId || null,
                },
              }).catch(() => {});
            }
          }
        }

        for (const r of recipients) {
          const hasUser = !!r.userId;
          const personalizedVars = {
            parentName: r.name,
            recipientName: r.name,
            studentName: r.studentName || r.name,
            amount: r.balanceAmount !== undefined ? r.balanceAmount : '',
            balance: r.balanceAmount !== undefined ? r.balanceAmount : '',
            ...dto.templateVariables,
          };
          const msgBody = template
            ? this.templateService.render(template.bodyTemplate, personalizedVars)
            : defaultContent;

          recipientLogs.push({
            id: `crl_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
            tenantId,
            campaignId,
            recipientUserId: r.userId || null,
            recipientType: r.role || 'PARENT',
            recipientName: r.name,
            recipientPhone: r.phone || null,
            recipientEmail: r.email || null,
            channel: CampaignChannel.IN_APP,
            messageContent: msgBody,
            cost: 0,
            status: hasUser ? 'DELIVERED' : 'FAILED',
            failureReason: hasUser ? null : 'No user account linked for in-app delivery',
            deliveredAt: hasUser ? now.toISOString() : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          });
        }

        const delivered = validUserRecipients.length;
        const failed = recipients.length - delivered;
        totalDelivered += delivered;
        totalFailed += failed;

        channelBreakdown.push({
          channel: CampaignChannel.IN_APP,
          attempted: recipients.length,
          delivered,
          failed,
          cost: 0,
          status: failed === 0 ? 'DELIVERED' : delivered > 0 ? 'PARTIALLY_FAILED' : 'FAILED',
        });
      } else if (channel === CampaignChannel.PUSH) {
        if (!settings.pushEnabled) {
          channelBreakdown.push({
            channel,
            attempted: recipients.length,
            delivered: 0,
            failed: 0,
            cost: 0,
            status: 'DISABLED',
            reason: 'Push notifications are disabled in communication settings',
          });
          continue;
        }

        const validRecipients = recipients.filter((r) => !!r.userId);
        const delivered = validRecipients.length;
        const failed = recipients.length - delivered;
        totalDelivered += delivered;
        totalFailed += failed;

        for (const r of recipients) {
          const hasUser = !!r.userId;
          recipientLogs.push({
            id: `crl_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
            tenantId,
            campaignId,
            recipientUserId: r.userId || null,
            recipientType: r.role || 'PARENT',
            recipientName: r.name,
            recipientPhone: r.phone || null,
            recipientEmail: r.email || null,
            channel: CampaignChannel.PUSH,
            messageContent: defaultContent,
            cost: 0,
            status: hasUser ? 'DELIVERED' : 'FAILED',
            failureReason: hasUser ? null : 'No push token / user link registered',
            deliveredAt: hasUser ? now.toISOString() : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          });
        }

        channelBreakdown.push({
          channel: CampaignChannel.PUSH,
          attempted: recipients.length,
          delivered,
          failed,
          cost: 0,
          status: failed === 0 ? 'DELIVERED' : delivered > 0 ? 'PARTIALLY_FAILED' : 'FAILED',
        });
      } else if (channel === CampaignChannel.EMAIL) {
        if (!settings.emailEnabled) {
          channelBreakdown.push({
            channel,
            attempted: recipients.length,
            delivered: 0,
            failed: 0,
            cost: 0,
            status: 'DISABLED',
            reason: 'Email notifications are disabled in communication settings',
          });
          continue;
        }

        const validEmails = recipients.filter((r) => !!r.email);
        for (const r of recipients) {
          const hasEmail = !!r.email;
          const personalizedVars = {
            parentName: r.name,
            recipientName: r.name,
            studentName: r.studentName || r.name,
            amount: r.balanceAmount !== undefined ? r.balanceAmount : '',
            balance: r.balanceAmount !== undefined ? r.balanceAmount : '',
            ...dto.templateVariables,
          };
          const msgBody = template
            ? this.templateService.render(template.bodyTemplate, personalizedVars)
            : defaultContent;
          const msgTitle = template
            ? this.templateService.render(template.subjectTemplate, personalizedVars)
            : defaultTitle;

          if (hasEmail && this.notificationProcessor) {
            this.notificationProcessor
              .process({
                id: `job_email_${randomUUID().substring(0, 6)}`,
                data: {
                  channel: 'email',
                  tenantId,
                  recipient: r.email!,
                  subject: msgTitle,
                  body: msgBody,
                },
              })
              .catch(() => {});
          }

          recipientLogs.push({
            id: `crl_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
            tenantId,
            campaignId,
            recipientUserId: r.userId || null,
            recipientType: r.role || 'PARENT',
            recipientName: r.name,
            recipientPhone: r.phone || null,
            recipientEmail: r.email || null,
            channel: CampaignChannel.EMAIL,
            messageContent: msgBody,
            cost: 0,
            status: hasEmail ? 'SENT' : 'FAILED',
            providerId: hasEmail ? `sim_email_${randomUUID().substring(0, 8)}` : null,
            failureReason: hasEmail ? null : 'No email address registered',
            sentAt: hasEmail ? now.toISOString() : null,
            deliveredAt: hasEmail ? now.toISOString() : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          });
        }

        const delivered = validEmails.length;
        const failed = recipients.length - delivered;
        totalDelivered += delivered;
        totalFailed += failed;

        channelBreakdown.push({
          channel: CampaignChannel.EMAIL,
          attempted: recipients.length,
          delivered,
          failed,
          cost: 0,
          status: failed === 0 ? 'DELIVERED' : delivered > 0 ? 'PARTIALLY_FAILED' : 'FAILED',
        });
      } else if (channel === CampaignChannel.SMS || channel === CampaignChannel.WHATSAPP) {
        const isEnabled = channel === CampaignChannel.SMS ? settings.smsEnabled : settings.whatsappEnabled;
        if (!isEnabled && !dto.channels?.includes(channel)) {
          channelBreakdown.push({
            channel,
            attempted: recipients.length,
            delivered: 0,
            failed: 0,
            cost: 0,
            status: 'DISABLED',
            reason: `${channel} channel is disabled in communication settings`,
          });
          continue;
        }

        const unitCost = Number(channel === CampaignChannel.SMS ? settings.smsUnitCost : settings.whatsappUnitCost);
        const validPhones = recipients.filter((r) => !!r.phone);
        const requiredFunds = Number((validPhones.length * unitCost).toFixed(2));

        let debitResult: { success: boolean; error?: string } = { success: true };
        if (requiredFunds > 0) {
          debitResult = await this.walletService.debitWallet(
            tenantId,
            requiredFunds,
            channel,
            `Campaign broadcast: ${defaultTitle} (${validPhones.length} recipients)`,
          );
        }

        if (debitResult.success) {
          totalCost += requiredFunds;
          for (const r of recipients) {
            const hasPhone = !!r.phone;
            const personalizedVars = {
              parentName: r.name,
              recipientName: r.name,
              studentName: r.studentName || r.name,
              amount: r.balanceAmount !== undefined ? r.balanceAmount : '',
              balance: r.balanceAmount !== undefined ? r.balanceAmount : '',
              ...dto.templateVariables,
            };
            const msgBody = template
              ? this.templateService.render(template.bodyTemplate, personalizedVars)
              : defaultContent;

            if (hasPhone && this.notificationProcessor) {
              this.notificationProcessor
                .process({
                  id: `job_${channel.toLowerCase()}_${randomUUID().substring(0, 6)}`,
                  data: {
                    channel: channel.toLowerCase() as any,
                    tenantId,
                    recipient: r.phone!,
                    body: msgBody,
                  },
                })
                .catch(() => {});
            }

            recipientLogs.push({
              id: `crl_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
              tenantId,
              campaignId,
              recipientUserId: r.userId || null,
              recipientType: r.role || 'PARENT',
              recipientName: r.name,
              recipientPhone: r.phone || null,
              recipientEmail: r.email || null,
              channel,
              messageContent: msgBody,
              cost: hasPhone ? unitCost : 0,
              status: hasPhone ? 'SENT' : 'FAILED',
              providerId: hasPhone ? `sim_${channel.toLowerCase()}_${randomUUID().substring(0, 8)}` : null,
              failureReason: hasPhone ? null : 'No phone number registered',
              sentAt: hasPhone ? now.toISOString() : null,
              deliveredAt: hasPhone ? now.toISOString() : null,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            });
          }

          const delivered = validPhones.length;
          const failed = recipients.length - delivered;
          totalDelivered += delivered;
          totalFailed += failed;

          channelBreakdown.push({
            channel,
            attempted: recipients.length,
            delivered,
            failed,
            cost: requiredFunds,
            status: failed === 0 ? 'DELIVERED' : delivered > 0 ? 'PARTIALLY_FAILED' : 'FAILED',
          });
        } else {
          totalFailed += recipients.length;
          for (const r of recipients) {
            recipientLogs.push({
              id: `crl_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
              tenantId,
              campaignId,
              recipientUserId: r.userId || null,
              recipientType: r.role || 'PARENT',
              recipientName: r.name,
              recipientPhone: r.phone || null,
              recipientEmail: r.email || null,
              channel,
              messageContent: defaultContent,
              cost: 0,
              status: 'FAILED',
              failureReason: debitResult.error || 'Insufficient communication balance',
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            });
          }

          channelBreakdown.push({
            channel,
            attempted: recipients.length,
            delivered: 0,
            failed: recipients.length,
            cost: 0,
            status: 'SKIPPED_INSUFFICIENT_BALANCE',
            reason: debitResult.error || 'Insufficient communication balance',
          });
        }
      }
    }

    const finalStatus =
      totalFailed === 0
        ? CampaignStatus.COMPLETED
        : totalDelivered > 0
        ? CampaignStatus.PARTIALLY_FAILED
        : CampaignStatus.FAILED;

    let dbTemplateId: string | null = null;
    if (dto.templateId) {
      const tmplExists = await this.prisma.messageTemplate.findUnique({
        where: { id: dto.templateId },
      });
      if (tmplExists) dbTemplateId = tmplExists.id;
    }

    await this.prisma.communicationCampaign.create({
      data: {
        id: campaignId,
        tenantId,
        authorId,
        templateId: dbTemplateId,
        title: defaultTitle,
        content: defaultContent,
        subject: defaultTitle,
        channels: targetChannels as any,
        audienceType: dto.audience.audienceType,
        audienceCriteria: dto.audience as any,
        priority: dto.priority || CampaignPriority.NORMAL,
        status: finalStatus,
        scheduledAt: null,
        totalRecipients: recipients.length,
        deliveredCount: totalDelivered,
        failedCount: totalFailed,
        totalCost,
        channelBreakdown: channelBreakdown as any,
        completedAt: now,
      },
    });

    if (recipientLogs.length > 0) {
      await this.prisma.communicationRecipientLog.createMany({
        data: recipientLogs.map((l) => ({
          id: l.id,
          tenantId: l.tenantId,
          campaignId: l.campaignId,
          recipientUserId: l.recipientUserId,
          recipientType: l.recipientType,
          recipientName: l.recipientName,
          recipientPhone: l.recipientPhone,
          recipientEmail: l.recipientEmail,
          channel: l.channel as any,
          messageContent: l.messageContent,
          cost: l.cost,
          status: l.status,
          providerId: l.providerId,
          failureReason: l.failureReason,
          sentAt: l.sentAt ? new Date(l.sentAt) : null,
          deliveredAt: l.deliveredAt ? new Date(l.deliveredAt) : null,
        })),
        skipDuplicates: true,
      });
    }

    this.logger.log(
      `Dispatched campaign ${campaignId} for tenant ${tenantId} (Status: ${finalStatus}, Delivered: ${totalDelivered}, Failed: ${totalFailed}, Cost: ₦${totalCost})`,
    );

    const result = await this.getCampaignById(tenantId, campaignId);
    return result!;
  }

  async listCampaigns(tenantId: string, filter?: CampaignFilterDto): Promise<CampaignRecord[]> {
    const where: any = { tenantId };
    if (filter?.status) {
      where.status = filter.status;
    }

    const rows = await this.prisma.communicationCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    let results = rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      authorId: r.authorId,
      templateId: r.templateId,
      title: r.title,
      content: r.content,
      subject: r.subject,
      channels: r.channels as any,
      audienceType: r.audienceType,
      audienceCriteria: r.audienceCriteria,
      priority: r.priority as any,
      status: r.status as any,
      scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
      totalRecipients: r.totalRecipients,
      deliveredCount: r.deliveredCount,
      failedCount: r.failedCount,
      totalCost: Number(r.totalCost),
      channelBreakdown: r.channelBreakdown as any,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    if (filter?.channel) {
      results = results.filter((c) => c.channels?.includes(filter.channel!));
    }
    return results;
  }

  async getCampaignById(tenantId: string, id: string): Promise<CampaignRecord | null> {
    const r = await this.prisma.communicationCampaign.findFirst({
      where: { tenantId, id },
    });
    if (!r) return null;

    return {
      id: r.id,
      tenantId: r.tenantId,
      authorId: r.authorId,
      templateId: r.templateId,
      title: r.title,
      content: r.content,
      subject: r.subject,
      channels: r.channels as any,
      audienceType: r.audienceType,
      audienceCriteria: r.audienceCriteria,
      priority: r.priority as any,
      status: r.status as any,
      scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
      totalRecipients: r.totalRecipients,
      deliveredCount: r.deliveredCount,
      failedCount: r.failedCount,
      totalCost: Number(r.totalCost),
      channelBreakdown: r.channelBreakdown as any,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async getCampaignLogs(
    tenantId: string,
    campaignId: string,
    filter?: { status?: string; channel?: string; limit?: number; offset?: number },
  ): Promise<{ data: RecipientLogRecord[]; total: number }> {
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;

    const where: any = { tenantId, campaignId };
    if (filter?.status) where.status = filter.status;
    if (filter?.channel) where.channel = filter.channel;

    const [rows, total] = await Promise.all([
      this.prisma.communicationRecipientLog.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.communicationRecipientLog.count({ where }),
    ]);

    const data: RecipientLogRecord[] = rows.map((l) => ({
      id: l.id,
      tenantId: l.tenantId,
      campaignId: l.campaignId,
      recipientUserId: l.recipientUserId,
      recipientType: l.recipientType,
      recipientName: l.recipientName,
      recipientPhone: l.recipientPhone,
      recipientEmail: l.recipientEmail,
      channel: l.channel as any,
      messageContent: l.messageContent,
      cost: Number(l.cost),
      status: l.status as any,
      providerId: l.providerId,
      failureReason: l.failureReason,
      sentAt: l.sentAt ? l.sentAt.toISOString() : null,
      deliveredAt: l.deliveredAt ? l.deliveredAt.toISOString() : null,
      metadata: l.metadata,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    }));

    return { data, total };
  }

  async cancelCampaign(tenantId: string, campaignId: string): Promise<CampaignRecord> {
    const campaign = await this.getCampaignById(tenantId, campaignId);
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    if (campaign.status === CampaignStatus.COMPLETED || campaign.status === CampaignStatus.PROCESSING) {
      throw new BadRequestException(`Cannot cancel a campaign with status ${campaign.status}`);
    }

    const now = new Date();
    await this.prisma.communicationCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'CANCELLED',
        updatedAt: now,
      },
    });

    this.logger.log(`Campaign ${campaignId} was cancelled for tenant ${tenantId}`);
    const updated = await this.getCampaignById(tenantId, campaignId);
    return updated!;
  }
}
