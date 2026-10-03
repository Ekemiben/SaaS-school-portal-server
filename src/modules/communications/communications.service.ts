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

    // Fan out individual InAppInboxItem records to target audience users for personal inbox feeds
    if (this.notificationsService) {
      try {
        const targetUserIds = new Set<string>();
        const audienceUpper = (announcement.audience || '').toUpperCase();

        if (this.prisma.isDbConnected) {
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
                  some: {
                    role: { name: { in: ['STAFF', 'TEACHER', 'ADMIN', 'PRINCIPAL', 'BURSAR'] } },
                  },
                },
              },
              select: { id: true },
            });
            staffUsers.forEach((u) => targetUserIds.add(u.id));
          } else {
            // General / ALL audience
            const allUsers = await this.prisma.user.findMany({
              where: { tenantId, isActive: true },
              select: { id: true },
            });
            allUsers.forEach((u) => targetUserIds.add(u.id));
          }
        } else {
          // Memory store fallback
          const users = Array.from(this.prisma.memoryStore.users.values()).filter(
            (u) => u.tenantId === tenantId && u.isActive !== false,
          );
          users.forEach((u) => targetUserIds.add(u.id));
        }

        if (targetUserIds.size > 0) {
          const inboxBatch = Array.from(targetUserIds).map((userId) => ({
            recipientUserId: userId,
            notificationId: id,
            title: announcement.title,
            message: announcement.content || announcement.message,
            priority: (announcement.priority as any) || 'NORMAL',
            category: 'ANNOUNCEMENT' as const,
          }));
          await this.notificationsService.createBatchInboxItems(tenantId, inboxBatch);
        }
      } catch (err: any) {
        this.logger.warn(`Could not fan out InAppInboxItems for announcement: ${err.message}`);
      }
    }

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
    const audNorm = audience ? audience.toUpperCase().trim() : null;
    const isParentAudience = audNorm && (audNorm === 'PARENT' || audNorm === 'PARENTS' || audNorm === 'ALL_PARENTS');
    const isStudentAudience = audNorm && (audNorm === 'STUDENT' || audNorm === 'STUDENTS' || audNorm === 'ALL_STUDENTS');
    const isStaffAudience = audNorm && (audNorm === 'STAFF' || audNorm === 'TEACHER' || audNorm === 'TEACHERS' || audNorm === 'ALL_STAFF');

    if (this.prisma.isDbConnected) {
      try {
        const notifications = await this.prisma.notification.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
        });

        if (notifications.length > 0) {
          const enriched = await Promise.all(
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
      } catch (err: any) {
        this.logger.warn(`Could not load announcements from DB: ${err.message}`);
      }
    }

    const items = Array.from(this.prisma.memoryStore.communications.values())
      .filter((c) => {
        if (c.tenantId !== tenantId) return false;
        if (campusId && c.campusId && c.campusId !== campusId) return false;
        if (!audNorm) return true;
        const cAud = (c.audience || '').toUpperCase();
        if (cAud === 'ALL' || cAud === 'GENERAL') return true;
        if (isParentAudience && (cAud.includes('PARENT') || c.recipientGroup?.toUpperCase().includes('PARENT'))) return true;
        if (isStudentAudience && (cAud.includes('STUDENT') || c.recipientGroup?.toUpperCase().includes('STUDENT'))) return true;
        if (isStaffAudience && (cAud.includes('STAFF') || cAud.includes('TEACHER') || c.recipientGroup?.toUpperCase().includes('STAFF'))) return true;
        return cAud === audNorm;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return Promise.all(items.map((c) => this.enrichAnnouncement(c, tenantId)));
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
      if (this.prisma.isDbConnected) {
        try {
          thread = await this.prisma.communicationThread.findFirst({
            where: { id: dto.threadId, tenantId },
          });
        } catch (err: any) {
          this.logger.warn(`Could not load thread from DB: ${err.message}`);
        }
      }
      if (!thread) {
        thread = this.prisma.memoryStore.communicationThreads.get(dto.threadId);
      }
      if (!thread || thread.tenantId !== tenantId) {
        throw new NotFoundException(`Conversation thread ${dto.threadId} not found`);
      }
      if (!recipientUserId && Array.isArray(thread.participantIds)) {
        recipientUserId = thread.participantIds.find((p: string) => p !== senderUserId) || thread.createdById;
      }
    }

    // 1. Verify recipient user belongs to tenant (Tenant Isolation)
    if (recipientUserId) {
      let recipientFound = false;

      if (this.prisma.isDbConnected) {
        try {
          const [recipient, sender] = await Promise.all([
            this.prisma.user.findFirst({
              where: { id: recipientUserId, tenantId },
            }),
            this.prisma.user.findFirst({
              where: { id: senderUserId, tenantId },
            }),
          ]);

          if (recipient) {
            recipientFound = true;
            recipientName = `${recipient.firstName} ${recipient.lastName}`.trim();
          }
          if (sender) {
            senderName = `${sender.firstName} ${sender.lastName}`.trim();
          }
        } catch (err: any) {
          this.logger.warn(`Could not verify users in DB: ${err.message}`);
        }
      }

      if (!recipientFound) {
        const memRecipient = this.prisma.memoryStore.users.get(recipientUserId);
        if (memRecipient && memRecipient.tenantId === tenantId) {
          recipientFound = true;
          recipientName = `${memRecipient.firstName || ''} ${memRecipient.lastName || ''}`.trim();
        }
        const memSender = this.prisma.memoryStore.users.get(senderUserId);
        if (memSender) {
          senderName = `${memSender.firstName || ''} ${memSender.lastName || ''}`.trim();
        }
      }

      if (!recipientFound && !thread) {
        throw new NotFoundException(`Recipient user ${recipientUserId} not found in tenant`);
      }
    }

    // 2. Resolve or create Thread
    if (!thread) {
      const participantIds = Array.from(new Set([senderUserId, recipientUserId].filter(Boolean))).sort();
      if (this.prisma.isDbConnected) {
        try {
          const threads = await this.prisma.communicationThread.findMany({
            where: { tenantId },
          });
          thread = threads.find((t) => {
            const p = t.participantIds as string[];
            return Array.isArray(p) && p.length === 2 && p.includes(senderUserId) && p.includes(recipientUserId!);
          });
        } catch (err: any) {
          this.logger.warn(`Could not search threads in DB: ${err.message}`);
        }
      }

      if (!thread) {
        const memThreads = Array.from(this.prisma.memoryStore.communicationThreads.values()).filter(
          (t: any) => t.tenantId === tenantId,
        );
        thread = memThreads.find((t: any) => {
          const p = t.participantIds as string[];
          return Array.isArray(p) && p.length === 2 && p.includes(senderUserId) && p.includes(recipientUserId!);
        });
      }

      if (!thread) {
        const newThreadId = `th_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
        thread = {
          id: newThreadId,
          tenantId,
          subject: dto.subject || `Conversation: ${senderName} & ${recipientName}`,
          createdById: senderUserId,
          participantIds,
          lastMessageAt: now,
          createdAt: now,
          updatedAt: now,
        };

        if (this.prisma.isDbConnected) {
          try {
            await this.prisma.communicationThread.create({
              data: {
                id: thread.id,
                tenantId: thread.tenantId,
                subject: thread.subject,
                createdById: thread.createdById,
                participantIds: thread.participantIds,
                lastMessageAt: now,
                createdAt: now,
                updatedAt: now,
              },
            });
          } catch (err: any) {
            this.logger.warn(`Could not create thread in DB: ${err.message}`);
          }
        }
        this.prisma.memoryStore.communicationThreads.set(thread.id, thread);
      }
    }

    // 3. Create Message
    const messageId = `msg_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const message = {
      id: messageId,
      threadId: thread.id,
      senderId: senderUserId,
      senderType: 'USER',
      content: dto.content,
      attachments: dto.attachments || null,
      readBy: [senderUserId],
      createdAt: now,
    };

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.communicationMessage.create({
          data: {
            id: message.id,
            threadId: message.threadId,
            senderId: message.senderId,
            senderType: message.senderType,
            content: message.content,
            attachments: message.attachments,
            readBy: message.readBy,
            createdAt: now,
          },
        });

        await this.prisma.communicationThread.update({
          where: { id: thread.id },
          data: {
            lastMessageAt: now,
            updatedAt: now,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not create message in DB: ${err.message}`);
      }
    }

    thread.lastMessageAt = now;
    thread.updatedAt = now;
    this.prisma.memoryStore.communicationThreads.set(thread.id, thread);
    this.prisma.memoryStore.communicationMessages.set(message.id, {
      ...message,
      tenantId,
    });

    // 4. In-App Inbox Notification for Recipient
    if (this.notificationsService) {
      try {
        const preview = dto.content.length > 120 ? `${dto.content.substring(0, 117)}...` : dto.content;
        const recipientUserIds: string[] = dto.recipientUserId
          ? [dto.recipientUserId]
          : (thread.participantIds || []).filter((id: string) => id !== senderUserId);

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
    if (this.prisma.isDbConnected) {
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
    } else {
      const user = this.prisma.memoryStore.users?.get(userId);
      const role = (user?.role || (user?.roles && user.roles[0]) || '').toUpperCase();
      return (
        !['STUDENT', 'PARENT', 'STUDENT', 'PARENT'].includes(role) ||
        [
          'ADMIN',
          'SCHOOL ADMIN',
          'SCHOOL OWNER',
          'ADMINISTRATOR',
          'TENANT_ADMIN',
          'SUPER_ADMIN',
          'PRINCIPAL',
          'OWNER',
          'PROPRIETOR',
        ].includes(role)
      );
    }
  }

  async getUserThreads(tenantId: string, userId: string) {
    const isAdmin = await this.checkIsTenantAdmin(tenantId, userId);

    if (this.prisma.isDbConnected) {
      try {
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

        if (userThreads.length > 0) {
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
      } catch (err: any) {
        this.logger.warn(`Could not load user threads from DB: ${err.message}`);
      }
    }

    // Fallback in memory
    const threads = Array.from(this.prisma.memoryStore.communicationThreads.values()).filter(
      (t: any) => t.tenantId === tenantId && (Array.isArray(t.participantIds) && t.participantIds.includes(userId)),
    );

    const allMessages = Array.from(this.prisma.memoryStore.communicationMessages.values()).filter(
      (m: any) => m.tenantId === tenantId,
    );

    return threads
      .map((t: any) => {
        const msgs = allMessages
          .filter((m: any) => m.threadId === t.id)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const lastMsg = msgs[0] || null;
        const pIds = t.participantIds || [];
        const otherUserId = pIds.find((id: string) => id !== userId) || t.createdById || null;
        const otherUser = otherUserId ? this.prisma.memoryStore.users.get(otherUserId) : null;
        const creatorUser = t.createdById ? this.prisma.memoryStore.users.get(t.createdById) : null;

        const createdByName = creatorUser
          ? `${creatorUser.firstName || ''} ${creatorUser.lastName || ''}`.trim()
          : otherUser
          ? `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim()
          : 'Parent';

        const unreadCount = msgs.filter((m: any) => {
          const readBy = m.readBy || [];
          return !readBy.includes(userId) && m.senderId !== userId;
        }).length;

        const lastMessageObj = lastMsg
          ? {
              id: lastMsg.id,
              senderId: lastMsg.senderId,
              content: lastMsg.content,
              createdAt: new Date(lastMsg.createdAt).toISOString(),
            }
          : null;

        return {
          id: t.id,
          tenantId: t.tenantId,
          subject: t.subject,
          createdById: t.createdById,
          createdByName,
          parentName: createdByName,
          studentName: t.studentName || null,
          className: t.className || null,
          participantIds: pIds,
          otherParticipant: otherUser
            ? {
                id: otherUser.id,
                name: `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim(),
                email: otherUser.email,
                phone: otherUser.phone,
              }
            : null,
          lastMessage: lastMessageObj,
          messages: lastMessageObj ? [lastMessageObj] : [],
          unreadCount,
          lastMessageAt: new Date(t.lastMessageAt).toISOString(),
          createdAt: new Date(t.createdAt).toISOString(),
          updatedAt: new Date(t.updatedAt).toISOString(),
        };
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }

  async getThreadMessages(tenantId: string, threadId: string, userId: string) {
    let thread: any = null;

    if (this.prisma.isDbConnected) {
      try {
        thread = await this.prisma.communicationThread.findFirst({
          where: { id: threadId, tenantId },
        });
      } catch (err: any) {
        this.logger.warn(`Could not load thread from DB: ${err.message}`);
      }
    }
    if (!thread) {
      thread = this.prisma.memoryStore.communicationThreads.get(threadId);
    }

    if (!thread || thread.tenantId !== tenantId) {
      throw new NotFoundException(`Conversation thread ${threadId} not found`);
    }

    const pIds = (thread.participantIds as string[]) || [];
    if (!pIds.includes(userId)) {
      throw new ForbiddenException('You do not have access to this conversation thread');
    }

    // Resolve student and class info for this thread
    let studentName: string | null = thread.studentName || null;
    let className: string | null = thread.className || null;
    let createdByName: string | null = null;

    if (this.prisma.isDbConnected && thread.createdById) {
      try {
        const creator = await this.prisma.user.findUnique({
          where: { id: thread.createdById },
          select: { firstName: true, lastName: true },
        });
        if (creator) {
          createdByName = `${creator.firstName} ${creator.lastName}`.trim();
        }
        if (!studentName) {
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
        }
      } catch {}
    }

    let messages: any[] = [];
    if (this.prisma.isDbConnected) {
      try {
        const rows = await this.prisma.communicationMessage.findMany({
          where: { threadId },
          orderBy: { createdAt: 'asc' },
        });

        if (rows.length > 0) {
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

          messages = rows.map((m) => ({
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
      } catch (err: any) {
        this.logger.warn(`Could not load messages from DB: ${err.message}`);
      }
    }

    // Memory store fallback
    const memMsgs = Array.from(this.prisma.memoryStore.communicationMessages.values())
      .filter((m: any) => m.threadId === threadId)
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const msg of memMsgs) {
      if (!msg.readBy) msg.readBy = [msg.senderId];
      if (!msg.readBy.includes(userId)) {
        msg.readBy.push(userId);
      }
    }

    messages = memMsgs.map((m: any) => ({
      id: m.id,
      threadId: m.threadId,
      senderId: m.senderId,
      senderType: m.senderType,
      content: m.content,
      attachments: m.attachments,
      readBy: m.readBy,
      isRead: Array.isArray(m.readBy) && m.readBy.length > 1,
      createdAt: new Date(m.createdAt).toISOString(),
    }));

    return {
      thread: {
        id: thread.id,
        subject: thread.subject,
        createdByName: thread.createdByName || 'Parent',
        parentName: thread.parentName || 'Parent',
        studentName: thread.studentName || studentName,
        className: thread.className || className,
        participantIds: thread.participantIds,
        lastMessageAt: new Date(thread.lastMessageAt).toISOString(),
      },
      messages,
    };
  }

  async markThreadAsRead(tenantId: string, threadId: string, userId: string) {
    let thread: any = null;
    if (this.prisma.isDbConnected) {
      try {
        thread = await this.prisma.communicationThread.findFirst({
          where: { id: threadId, tenantId },
        });
      } catch {}
    }
    if (!thread) {
      thread = this.prisma.memoryStore.communicationThreads.get(threadId);
    }
    if (!thread || thread.tenantId !== tenantId) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        this.logger.warn(`Could not mark messages as read in DB: ${err.message}`);
      }
    }

    const memMsgs = Array.from(this.prisma.memoryStore.communicationMessages.values()).filter(
      (m: any) => m.threadId === threadId,
    );
    for (const m of memMsgs) {
      if (!m.readBy) m.readBy = [m.senderId];
      if (!m.readBy.includes(userId)) {
        m.readBy.push(userId);
      }
    }

    return { success: true, threadId };
  }
}
