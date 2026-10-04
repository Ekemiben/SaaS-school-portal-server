import { Injectable, Optional, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateAnnouncementDto, SendDirectMessageDto } from './dto/create-announcement.dto.js';
import { QueueService } from '../../jobs/queue.service.js';
import { QUEUES, JOB_TYPES } from '../../jobs/queue.constants.js';
import { OutboxService } from '../../infrastructure/outbox/outbox.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class CommunicationsService {
  private readonly logger = new Logger(CommunicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    @Optional() private readonly outboxService?: OutboxService,
    @Optional() private readonly notificationsService?: NotificationsService,
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
      if (tenantId) {
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
                isActive: true,
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
    const id = `notif_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const notification = await this.prisma.notification.create({
      data: {
        id,
        tenantId,
        recipientUserId: null,
        title: dto.title,
        message: dto.content || (dto as any).message || '',
        channel: 'IN_APP',
        status: 'SENT',
      },
    });

    const announcement = await this.enrichAnnouncement({
      id: notification.id,
      tenantId,
      authorId: authorUserId,
      ...dto,
      createdAt: notification.createdAt,
      updatedAt: notification.createdAt,
    }, tenantId);

    // Fan out individual InAppInboxItem records to target audience users for personal inbox feeds
    if (this.notificationsService) {
      try {
        const targetUserIds = new Set<string>();
        const audienceUpper = (announcement.audience || '').toUpperCase();

        if (audienceUpper === 'PARENTS' || audienceUpper === 'ALL_PARENTS') {
          const parents = await this.prisma.parent.findMany({
            where: { tenantId, userId: { not: null } },
            select: { userId: true },
          });
          parents.forEach((p) => p.userId && targetUserIds.add(p.userId));
        } else if (
          audienceUpper === 'STAFF' ||
          audienceUpper === 'TEACHERS' ||
          audienceUpper === 'ALL_STAFF' ||
          audienceUpper === 'ALL_TEACHERS'
        ) {
          const staffUsers = await this.prisma.user.findMany({
            where: {
              tenantId,
              isActive: true,
              userRoles: {
                some: { role: { name: { in: ['TEACHER', 'STAFF', 'ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL'] } } },
              },
            },
            select: { id: true },
          });
          staffUsers.forEach((u) => targetUserIds.add(u.id));
        } else if (audienceUpper === 'STUDENTS' || audienceUpper === 'ALL_STUDENTS') {
          const studentUsers = await this.prisma.user.findMany({
            where: {
              tenantId,
              isActive: true,
              userRoles: {
                some: { role: { name: 'STUDENT' } },
              },
            },
            select: { id: true },
          });
          studentUsers.forEach((u) => targetUserIds.add(u.id));
        } else {
          // ALL users in tenant
          const allTenantUsers = await this.prisma.user.findMany({
            where: { tenantId, isActive: true },
            select: { id: true },
          });
          allTenantUsers.forEach((u) => targetUserIds.add(u.id));
        }

        const previewText = announcement.message.length > 120
          ? `${announcement.message.substring(0, 117)}...`
          : announcement.message;

        for (const recipientId of Array.from(targetUserIds)) {
          await this.notificationsService.createInboxItem(tenantId, {
            recipientUserId: recipientId,
            title: announcement.title,
            message: previewText,
            category: 'ANNOUNCEMENT',
            priority: 'NORMAL',
            actionUrl: `/communications?id=${announcement.id}`,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Could not fan out inbox notifications for announcement: ${err.message}`);
      }
    }

    this.logger.log(`Created announcement ${id} for tenant ${tenantId}`);
    return announcement;
  }

  async getAnnouncements(tenantId: string, audience?: string, campusId?: string) {
    return this.findAllAnnouncements(tenantId, campusId, audience);
  }

  async findAllAnnouncements(tenantId: string, campusId?: string, audience?: string) {
    const audNorm = (audience || '').toUpperCase();
    const isParentAudience = audNorm.includes('PARENT');
    const isStudentAudience = audNorm.includes('STUDENT');
    const isStaffAudience = audNorm.includes('STAFF') || audNorm.includes('TEACHER');

    const notifs = await this.prisma.notification.findMany({
      where: {
        tenantId,
        recipientUserId: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(
      notifs.map((n) =>
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

    return enriched.filter((c) => {
      if (!audNorm) return true;
      const cAud = (c.audience || '').toUpperCase();
      if (cAud === 'ALL' || cAud === 'GENERAL') return true;
      if (isParentAudience && (cAud.includes('PARENT') || c.recipientGroup?.toUpperCase().includes('PARENT'))) return true;
      if (isStudentAudience && (cAud.includes('STUDENT') || c.recipientGroup?.toUpperCase().includes('STUDENT'))) return true;
      if (isStaffAudience && (cAud.includes('STAFF') || cAud.includes('TEACHER') || c.recipientGroup?.toUpperCase().includes('STAFF'))) return true;
      return cAud === audNorm;
    });
  }

  async sendDirectMessage(tenantId: string, senderUserId: string, dto: SendDirectMessageDto) {
    if (!dto.threadId && !dto.recipientUserId) {
      throw new BadRequestException('Recipient user ID or thread ID is required');
    }
    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('Message content cannot be empty');
    }

    const now = new Date();
    let recipientName = 'Recipient';
    let senderName = 'User';
    let recipientUserId = dto.recipientUserId;
    let thread: any = null;

    if (dto.threadId) {
      thread = await this.prisma.communicationThread.findFirst({
        where: { id: dto.threadId, tenantId },
      });
      if (!thread) {
        throw new NotFoundException(`Conversation thread ${dto.threadId} not found`);
      }
      if (!recipientUserId && Array.isArray(thread.participantIds)) {
        recipientUserId = (thread.participantIds as string[]).find((p: string) => p !== senderUserId) || thread.createdById;
      }
    }

    // 1. Verify recipient user belongs to tenant (Tenant Isolation)
    if (recipientUserId) {
      const [recipient, sender] = await Promise.all([
        this.prisma.user.findFirst({
          where: { id: recipientUserId, tenantId },
        }),
        this.prisma.user.findFirst({
          where: { id: senderUserId, tenantId },
        }),
      ]);

      if (recipient) {
        recipientName = `${recipient.firstName} ${recipient.lastName}`.trim();
      } else if (!thread) {
        throw new NotFoundException(`Recipient user ${recipientUserId} not found in tenant`);
      }
      if (sender) {
        senderName = `${sender.firstName} ${sender.lastName}`.trim();
      }
    }

    // 2. Resolve or create Thread
    if (!thread) {
      const participantIds = Array.from(new Set([senderUserId, recipientUserId].filter(Boolean))).sort();
      const threads = await this.prisma.communicationThread.findMany({
        where: { tenantId },
      });
      thread = threads.find((t) => {
        const p = t.participantIds as string[];
        return Array.isArray(p) && p.length === 2 && p.includes(senderUserId) && p.includes(recipientUserId!);
      });

      if (!thread) {
        const newThreadId = `th_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
        thread = await this.prisma.communicationThread.create({
          data: {
            id: newThreadId,
            tenantId,
            subject: dto.subject || `Conversation: ${senderName} & ${recipientName}`,
            createdById: senderUserId,
            participantIds,
            lastMessageAt: now,
          },
        });
      }
    }

    // 3. Create Message
    const messageId = `msg_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const message = await this.prisma.communicationMessage.create({
      data: {
        id: messageId,
        threadId: thread.id,
        senderId: senderUserId,
        senderType: 'USER',
        content: dto.content,
        attachments: dto.attachments || undefined,
        readBy: [senderUserId],
      },
    });

    await this.prisma.communicationThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: now,
      },
    });

    // 4. In-App Inbox Notification for Recipient
    if (this.notificationsService) {
      try {
        const preview = dto.content.length > 120 ? `${dto.content.substring(0, 117)}...` : dto.content;
        const recipientUserIds: string[] = dto.recipientUserId
          ? [dto.recipientUserId]
          : ((thread.participantIds as string[]) || []).filter((id: string) => id !== senderUserId);

        for (const rId of recipientUserIds) {
          await this.notificationsService.createInboxItem(tenantId, {
            recipientUserId: rId,
            title: `New message from ${senderName}`,
            message: preview,
            category: 'GENERAL',
            priority: 'NORMAL',
            actionUrl: `/communications/threads/${thread.id}`,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Could not create inbox notification for direct message: ${err.message}`);
      }
    }

    this.logger.log(`Direct message ${message.id} sent in thread ${thread.id} for tenant ${tenantId}`);
    return {
      message: {
        ...message,
        createdAt: now.toISOString(),
      },
      thread: {
        id: thread.id,
        subject: thread.subject,
        participantIds: thread.participantIds,
        lastMessageAt: now.toISOString(),
      },
    };
  }

  private async checkIsTenantAdmin(tenantId: string, userId: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      });
      if (!user) return false;
      if (user.isPlatformAdmin) return true;

      const roleNames = (user.userRoles || []).map((ur) =>
        (ur.role?.name || '').toUpperCase().replace(/[\s_-]/g, ''),
      );
      const adminKeywords = [
        'ADMIN',
        'SCHOOLADMIN',
        'SCHOOLOWNER',
        'ADMINISTRATOR',
        'TENANTADMIN',
        'SUPERADMIN',
        'PRINCIPAL',
        'OWNER',
        'PROPRIETOR',
        'HEAD',
        'CAMPUSADMIN',
        'VICEPRINCIPAL',
        'STAFF',
        'DIRECTOR',
        'MANAGER',
      ];
      if (roleNames.some((r) => adminKeywords.some((kw) => r.includes(kw) || kw.includes(r)))) {
        return true;
      }

      const permissions = (user.userRoles || []).flatMap((ur) =>
        (ur.role?.permissions || []).map((rp) => rp.permission?.name || ''),
      );
      if (
        permissions.includes('communications.view') ||
        permissions.includes('communications.manage') ||
        permissions.includes('parents.manage') ||
        permissions.includes('parents.view') ||
        permissions.includes('dashboard.view') ||
        permissions.includes('*')
      ) {
        return true;
      }

      const isParentOrStudent = roleNames.some((r) => r.includes('STUDENT') || r.includes('PARENT'));
      return !isParentOrStudent;
    } catch {
      return false;
    }
  }

  async getUserThreads(tenantId: string, userId: string) {
    const isAdmin = await this.checkIsTenantAdmin(tenantId, userId);

    const threads = await this.prisma.communicationThread.findMany({
      where: { tenantId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    const userThreads = threads.filter((t) => {
      const p = t.participantIds as string[];
      return (Array.isArray(p) && p.includes(userId)) || isAdmin;
    });

    if (userThreads.length === 0) {
      return [];
    }

    const allParticipantIds = new Set<string>();
    userThreads.forEach((t) => {
      const p = t.participantIds as string[];
      p?.forEach((id) => {
        if (id !== userId) allParticipantIds.add(id);
      });
      if (t.createdById) allParticipantIds.add(t.createdById);
    });

    const participantUsers = await this.prisma.user.findMany({
      where: { id: { in: Array.from(allParticipantIds) } },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });
    const userMap = new Map<string, any>(participantUsers.map((u) => [u.id, u]));

    // Resolve parent and student/class profiles for thread creators by userId AND email
    const participantEmails = Array.from(userMap.values())
      .map((u) => u.email?.toLowerCase().trim())
      .filter(Boolean);

    const parents = await this.prisma.parent.findMany({
      where: {
        tenantId,
        OR: [
          { userId: { in: Array.from(allParticipantIds) } },
          ...(participantEmails.length > 0 ? [{ email: { in: participantEmails } }] : []),
        ],
      },
      include: {
        students: {
          include: {
            student: {
              include: {
                enrollments: {
                  where: { status: 'ACTIVE' },
                  include: { class: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    const parentMap = new Map<string, any>();
    for (const p of parents) {
      if (p.userId) parentMap.set(p.userId, p);
      if (p.email) parentMap.set(p.email.toLowerCase().trim(), p);
    }

    return userThreads.map((t) => {
      const msgs = t.messages || [];
      const lastMsg = msgs[0] || null;
      const pIds = (t.participantIds as string[]) || [];
      const otherUserId = pIds.find((id) => id !== userId) || t.createdById || null;
      const otherUser = otherUserId ? userMap.get(otherUserId) : null;
      const creatorUser = t.createdById ? userMap.get(t.createdById) : null;

      const parent =
        (otherUserId && (parentMap.get(otherUserId) || (otherUser?.email && parentMap.get(otherUser.email.toLowerCase().trim())))) ||
        (t.createdById && (parentMap.get(t.createdById) || (creatorUser?.email && parentMap.get(creatorUser.email.toLowerCase().trim()))));
      const ward = parent?.students?.[0]?.student;
      const studentName = ward ? `${ward.firstName} ${ward.lastName}`.trim() : null;
      const className = ward?.enrollments?.[0]?.class?.name || (ward as any)?.currentClass || null;

      const createdByName = creatorUser
        ? `${creatorUser.firstName || ''} ${creatorUser.lastName || ''}`.trim()
        : parent
        ? `${parent.firstName || ''} ${parent.lastName || ''}`.trim()
        : otherUser
        ? `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim()
        : 'Parent';

      const unreadCount = msgs.filter((m) => {
        const readBy = (m.readBy as string[]) || [];
        return !readBy.includes(userId) && m.senderId !== userId;
      }).length;

      const lastMessageObj = lastMsg
        ? {
            id: lastMsg.id,
            senderId: lastMsg.senderId,
            content: lastMsg.content,
            createdAt: lastMsg.createdAt.toISOString(),
          }
        : null;

      return {
        id: t.id,
        tenantId: t.tenantId,
        subject: t.subject,
        createdById: t.createdById,
        createdByName,
        parentName: createdByName,
        studentName,
        className,
        participantIds: pIds,
        otherParticipant: otherUser
          ? {
              id: otherUser.id,
              name: `${otherUser.firstName} ${otherUser.lastName}`.trim(),
              email: otherUser.email,
              phone: otherUser.phone,
            }
          : null,
        lastMessage: lastMessageObj,
        messages: lastMessageObj ? [lastMessageObj] : [],
        unreadCount,
        lastMessageAt: t.lastMessageAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });
  }

  async getThreadMessages(tenantId: string, threadId: string, userId: string) {
    const thread = await this.prisma.communicationThread.findFirst({
      where: { id: threadId, tenantId },
    });

    if (!thread) {
      throw new NotFoundException(`Conversation thread ${threadId} not found`);
    }

    const pIds = (thread.participantIds as string[]) || [];
    const isAdmin = await this.checkIsTenantAdmin(tenantId, userId);
    if (!pIds.includes(userId) && !isAdmin) {
      throw new ForbiddenException('You do not have access to this conversation thread');
    }

    // Resolve student and class info for this thread
    let studentName: string | null = null;
    let className: string | null = null;
    let createdByName: string | null = null;

    if (thread.createdById) {
      try {
        const creator = await this.prisma.user.findUnique({
          where: { id: thread.createdById },
          select: { firstName: true, lastName: true },
        });
        if (creator) {
          createdByName = `${creator.firstName} ${creator.lastName}`.trim();
        }
        const parent = await this.prisma.parent.findFirst({
          where: { tenantId, userId: thread.createdById },
          include: {
            students: {
              include: {
                student: {
                  include: {
                    enrollments: {
                      where: { status: 'ACTIVE' },
                      include: { class: true },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        });
        const ward = parent?.students?.[0]?.student;
        if (ward) {
          studentName = `${ward.firstName} ${ward.lastName}`.trim();
          className = ward.enrollments?.[0]?.class?.name || null;
        }
      } catch {}
    }

    const rows = await this.prisma.communicationMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });

    // Automatically mark unread messages as read by userId
    for (const msg of rows) {
      const readBy = (msg.readBy as string[]) || [];
      if (!readBy.includes(userId)) {
        const updatedReadBy = [...readBy, userId];
        msg.readBy = updatedReadBy;
        await this.prisma.communicationMessage
          .update({
            where: { id: msg.id },
            data: { readBy: updatedReadBy },
          })
          .catch(() => {});
      }
    }

    const messages = rows.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      senderId: m.senderId,
      senderType: m.senderType,
      content: m.content,
      attachments: m.attachments,
      readBy: m.readBy,
      isRead: Array.isArray(m.readBy) && m.readBy.length > 1,
      createdAt: m.createdAt.toISOString(),
    }));

    return {
      thread: {
        id: thread.id,
        subject: thread.subject,
        createdByName: createdByName || 'Parent',
        parentName: createdByName || 'Parent',
        studentName,
        className,
        participantIds: thread.participantIds,
        lastMessageAt: thread.lastMessageAt ? new Date(thread.lastMessageAt).toISOString() : null,
      },
      messages,
    };
  }

  async markThreadAsRead(tenantId: string, threadId: string, userId: string) {
    const thread = await this.prisma.communicationThread.findFirst({
      where: { id: threadId, tenantId },
    });
    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    const msgs = await this.prisma.communicationMessage.findMany({
      where: { threadId },
    });
    for (const m of msgs) {
      const readBy = (m.readBy as string[]) || [];
      if (!readBy.includes(userId)) {
        await this.prisma.communicationMessage.update({
          where: { id: m.id },
          data: { readBy: [...readBy, userId] },
        });
      }
    }

    return { success: true, threadId };
  }
}
