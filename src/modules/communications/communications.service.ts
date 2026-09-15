import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateAnnouncementDto, SendDirectMessageDto } from './dto/create-announcement.dto.js';
import { QueueService } from '../../jobs/queue.service.js';
import { QUEUES, JOB_TYPES } from '../../jobs/queue.constants.js';

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  private enrichAnnouncement(c: any) {
    const dateStr =
      c.sentAt ||
      (c.createdAt
        ? new Date(c.createdAt).toISOString().replace('T', ' ').substring(0, 16)
        : new Date().toISOString().replace('T', ' ').substring(0, 16));
    const channel =
      c.channel || (Array.isArray(c.channels) ? c.channels.join(' & ') : 'Portal Noticeboard');
    const message = c.message || c.content || '';
    const content = c.content || c.message || '';
    const recipientGroup =
      c.recipientGroup ||
      (c.audience
        ? `All ${c.audience.charAt(0) + c.audience.slice(1).toLowerCase()}`
        : 'All Parents & Guardians');
    const recipientCount =
      c.recipientCount || (recipientGroup.toLowerCase().includes('all') ? 1240 : 320);
    const status = c.status || 'Delivered';
    const deliveryRate =
      c.deliveryRate ||
      (status === 'Delivered' ? '99.4%' : status === 'Scheduled' ? 'Pending' : '100%');
    const sender = c.sender || "Principal's Desk";

    return {
      ...c,
      id: c.id,
      title: c.title,
      message,
      content,
      channel,
      recipientGroup,
      recipientCount,
      status,
      deliveryRate,
      sender,
      sentAt: dateStr,
      audience:
        c.audience ||
        (recipientGroup.toUpperCase().includes('PARENT')
          ? 'PARENTS'
          : recipientGroup.toUpperCase().includes('STAFF')
          ? 'STAFF'
          : 'ALL'),
      createdAt: c.createdAt || new Date(),
      updatedAt: c.updatedAt || new Date(),
    };
  }

  async createAnnouncement(tenantId: string, authorUserId: string, dto: CreateAnnouncementDto) {
    const id = `COM-2025-00${this.prisma.memoryStore.communications.size + 1}`;
    const announcement = this.enrichAnnouncement({
      id,
      tenantId,
      authorId: authorUserId,
      ...dto,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.prisma.memoryStore.communications.set(id, announcement);

    // If email or SMS channels requested, dispatch notifications to persistent queue
    const channelStr = (announcement.channel || '').toUpperCase();
    if (channelStr.includes('EMAIL') || channelStr.includes('SMS')) {
      const channel = channelStr.includes('EMAIL') ? 'email' : 'sms';
      await this.queueService.addJob(
        QUEUES.NOTIFICATIONS,
        channel === 'email' ? JOB_TYPES.SEND_EMAIL : JOB_TYPES.SEND_SMS,
        {
          channel,
          tenantId,
          recipient: 'broadcast-audience',
          subject: announcement.title,
          body: announcement.content || announcement.message,
          metadata: { announcementId: id, audience: announcement.audience },
        },
        { attempts: 3, backoffDelay: 1000 },
      );
    }

    return announcement;
  }

  async getAnnouncements(tenantId: string, audience?: string, campusId?: string) {
    const items = Array.from(this.prisma.memoryStore.communications.values())
      .filter(
        (c) =>
          c.tenantId === tenantId &&
          (!audience || c.audience === 'ALL' || c.audience === audience) &&
          (!campusId || !c.campusId || c.campusId === campusId),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return items.map((c) => this.enrichAnnouncement(c));
  }

  async sendDirectMessage(tenantId: string, senderUserId: string, dto: SendDirectMessageDto) {
    const threadId = dto.threadId || `thread_${[senderUserId, dto.recipientUserId].sort().join('_')}`;
    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const message = {
      id,
      tenantId,
      threadId,
      senderId: senderUserId,
      recipientId: dto.recipientUserId,
      content: dto.content,
      read: false,
      createdAt: new Date(),
    };

    this.prisma.memoryStore.communicationThreads.set(id, message);
    return message;
  }

  async getThreadMessages(tenantId: string, threadId: string) {
    const messages = Array.from(this.prisma.memoryStore.communicationThreads.values())
      .filter((m) => m.tenantId === tenantId && m.threadId === threadId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return messages;
  }

  async getUserThreads(tenantId: string, userId: string) {
    const userMessages = Array.from(this.prisma.memoryStore.communicationThreads.values()).filter(
      (m) => m.tenantId === tenantId && (m.senderId === userId || m.recipientId === userId),
    );

    const threadMap = new Map<string, any>();
    for (const msg of userMessages) {
      const existing = threadMap.get(msg.threadId);
      if (!existing || new Date(msg.createdAt) > new Date(existing.lastMessageAt)) {
        threadMap.set(msg.threadId, {
          threadId: msg.threadId,
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt,
          otherParticipantId: msg.senderId === userId ? msg.recipientId : msg.senderId,
          unread: !msg.read && msg.recipientId === userId,
        });
      }
    }

    return Array.from(threadMap.values()).sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    );
  }
}
