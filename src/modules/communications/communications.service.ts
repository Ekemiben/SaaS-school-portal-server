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

  async createAnnouncement(tenantId: string, authorUserId: string, dto: CreateAnnouncementDto) {
    const id = `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const announcement = {
      id,
      tenantId,
      authorId: authorUserId,
      ...dto,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.communications.set(id, announcement);

    // If email or SMS channels requested, dispatch notifications to persistent queue
    if (dto.channels?.includes('EMAIL') || dto.channels?.includes('SMS')) {
      const channel = dto.channels.includes('EMAIL') ? 'email' : 'sms';
      await this.queueService.addJob(
        QUEUES.NOTIFICATIONS,
        channel === 'email' ? JOB_TYPES.SEND_EMAIL : JOB_TYPES.SEND_SMS,
        {
          channel,
          tenantId,
          recipient: 'broadcast-audience',
          subject: dto.title,
          body: dto.content,
          metadata: { announcementId: id, audience: dto.audience },
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

    return items;
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
