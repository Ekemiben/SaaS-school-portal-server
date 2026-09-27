import { Injectable, Optional, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateAnnouncementDto, SendDirectMessageDto } from './dto/create-announcement.dto.js';
import { QueueService } from '../../jobs/queue.service.js';
import { QUEUES, JOB_TYPES } from '../../jobs/queue.constants.js';
import { OutboxService } from '../../infrastructure/outbox/outbox.service.js';

@Injectable()
export class CommunicationsService {
  private readonly logger = new Logger(CommunicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    @Optional() private readonly outboxService?: OutboxService,
  ) {}

  private async enrichAnnouncement(c: any, tenantId?: string) {
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

    let recipientCount = c.recipientCount;
    if (recipientCount === undefined || recipientCount === null) {
      if (tenantId && this.prisma.isDbConnected) {
        try {
          const audience = (c.audience || '').toUpperCase();
          if (audience === 'PARENTS') {
            recipientCount = await this.prisma.parent.count({ where: { tenantId } });
          } else if (audience === 'STUDENTS') {
            recipientCount = await this.prisma.student.count({ where: { tenantId, status: 'ACTIVE' } });
          } else if (audience === 'STAFF') {
            recipientCount = await this.prisma.user.count({
              where: {
                tenantId,
                status: 'ACTIVE',
                userRoles: { some: { role: { name: { in: ['STAFF', 'TEACHER', 'ADMIN'] } } } },
              },
            });
          } else {
            const [pCount, sCount] = await Promise.all([
              this.prisma.parent.count({ where: { tenantId } }),
              this.prisma.student.count({ where: { tenantId, status: 'ACTIVE' } }),
            ]);
            recipientCount = pCount + sCount;
          }
        } catch {
          recipientCount = 0;
        }
      } else {
        recipientCount = 0;
      }
    }

    const status = c.status || 'Delivered';
    const deliveryRate =
      c.deliveryRate ||
      (status === 'Delivered' ? '100%' : status === 'Scheduled' ? 'Pending' : '100%');
    const sender = c.sender || "Principal's Desk";

    return {
      ...c,
      id: c.id,
      title: c.title,
      message,
      content,
      channel,
      recipientGroup,
      recipientCount: Number(recipientCount || 0),
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
    const id = `COM-${new Date().getFullYear()}-${(this.prisma.memoryStore.communications.size + 1).toString().padStart(4, '0')}`;
    const announcement = await this.enrichAnnouncement({
      id,
      tenantId,
      authorId: authorUserId,
      ...dto,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, tenantId);

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.notification.create({
          data: {
            id,
            tenantId,
            recipientUserId: null,
            title: announcement.title,
            message: announcement.content || announcement.message,
            channel: 'IN_APP',
            status: 'SENT',
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not persist announcement to DB: ${err.message}`);
      }
    }

    this.prisma.memoryStore.communications.set(id, announcement);

    // Record outbox event for reliable asynchronous delivery per Constitution Section 64
    if (this.outboxService) {
      await this.outboxService.recordEvent(
        tenantId,
        'COMMUNICATION_BROADCAST',
        {
          announcementId: id,
          title: announcement.title,
          audience: announcement.audience,
          channel: announcement.channel,
          authorId: authorUserId,
          createdAt: announcement.createdAt,
        },
      );
    }

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
    if (this.prisma.isDbConnected) {
      try {
        const notifications = await this.prisma.notification.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
        });

        if (notifications.length > 0) {
          return Promise.all(
            notifications.map((n) =>
              this.enrichAnnouncement(
                {
                  id: n.id,
                  tenantId: n.tenantId,
                  title: n.title,
                  message: n.message,
                  content: n.message,
                  channel: n.channel,
                  status: n.status === 'SENT' ? 'Delivered' : n.status,
                  createdAt: n.createdAt,
                },
                tenantId,
              ),
            ),
          );
        }
      } catch (err: any) {
        this.logger.warn(`Could not load announcements from DB: ${err.message}`);
      }
    }

    const items = Array.from(this.prisma.memoryStore.communications.values())
      .filter(
        (c) =>
          c.tenantId === tenantId &&
          (!audience || c.audience === 'ALL' || c.audience === audience) &&
          (!campusId || !c.campusId || c.campusId === campusId),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return Promise.all(items.map((c) => this.enrichAnnouncement(c, tenantId)));
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

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.notification.create({
          data: {
            id,
            tenantId,
            recipientUserId: dto.recipientUserId,
            title: 'Direct Message',
            message: dto.content,
            channel: 'IN_APP',
            status: 'SENT',
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not persist direct message to DB: ${err.message}`);
      }
    }

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
