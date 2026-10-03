import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

export interface CreateInboxItemDto {
  recipientUserId: string;
  title: string;
  message: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  category?: 'GENERAL' | 'ANNOUNCEMENT' | 'FEE_REMINDER' | 'RESULT' | 'ATTENDANCE' | 'HOMEWORK' | 'EMERGENCY';
  actionUrl?: string;
  notificationId?: string;
  campaignId?: string;
}

export interface ListInboxQueryDto {
  isRead?: boolean;
  category?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createInboxItem(tenantId: string, dto: CreateInboxItemDto) {
    const id = `inbox_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const now = new Date();

    if (this.prisma.isDbConnected) {
      try {
        const item = await this.prisma.inAppInboxItem.create({
          data: {
            id,
            tenantId,
            recipientUserId: dto.recipientUserId,
            notificationId: dto.notificationId || null,
            campaignId: dto.campaignId || null,
            title: dto.title,
            message: dto.message,
            priority: dto.priority || 'NORMAL',
            category: dto.category || 'GENERAL',
            actionUrl: dto.actionUrl || null,
            isRead: false,
            createdAt: now,
            updatedAt: now,
          },
        });
        return item;
      } catch (err: any) {
        this.logger.warn(`Could not persist InAppInboxItem in DB: ${err.message}`);
      }
    }

    const fallbackItem = {
      id,
      tenantId,
      recipientUserId: dto.recipientUserId,
      notificationId: dto.notificationId || null,
      campaignId: dto.campaignId || null,
      title: dto.title,
      message: dto.message,
      priority: dto.priority || 'NORMAL',
      category: dto.category || 'GENERAL',
      actionUrl: dto.actionUrl || null,
      isRead: false,
      readAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.prisma.memoryStore.inboxItems.set(id, fallbackItem);
    return fallbackItem;
  }

  async createBatchInboxItems(tenantId: string, items: CreateInboxItemDto[]): Promise<number> {
    if (!items || items.length === 0) return 0;

    let createdCount = 0;
    const now = new Date();

    if (this.prisma.isDbConnected) {
      try {
        const result = await this.prisma.inAppInboxItem.createMany({
          data: items.map((item) => ({
            id: `inbox_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
            tenantId,
            recipientUserId: item.recipientUserId,
            notificationId: item.notificationId || null,
            campaignId: item.campaignId || null,
            title: item.title,
            message: item.message,
            priority: item.priority || 'NORMAL',
            category: item.category || 'GENERAL',
            actionUrl: item.actionUrl || null,
            isRead: false,
            createdAt: now,
            updatedAt: now,
          })),
        });
        return result.count;
      } catch (err: any) {
        this.logger.warn(`Could not execute batch insert for InAppInboxItems in DB: ${err.message}`);
      }
    }

    for (const item of items) {
      const id = `inbox_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
      const fallbackItem = {
        id,
        tenantId,
        recipientUserId: item.recipientUserId,
        notificationId: item.notificationId || null,
        campaignId: item.campaignId || null,
        title: item.title,
        message: item.message,
        priority: item.priority || 'NORMAL',
        category: item.category || 'GENERAL',
        actionUrl: item.actionUrl || null,
        isRead: false,
        readAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.prisma.memoryStore.inboxItems.set(id, fallbackItem);
      createdCount++;
    }
    return createdCount;
  }

  async listUserInbox(tenantId: string, userId: string, query?: ListInboxQueryDto) {
    const limit = query?.limit ? Math.min(Number(query.limit), 100) : 50;
    const offset = query?.offset ? Number(query.offset) : 0;

    if (this.prisma.isDbConnected) {
      try {
        const whereClause: any = {
          tenantId,
          recipientUserId: userId,
          archivedAt: null,
        };
        if (query?.isRead !== undefined) {
          whereClause.isRead = String(query.isRead) === 'true' || query.isRead === true;
        }
        if (query?.category) {
          whereClause.category = query.category;
        }

        const [items, total] = await Promise.all([
          this.prisma.inAppInboxItem.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
          }),
          this.prisma.inAppInboxItem.count({ where: whereClause }),
        ]);

        if (items.length > 0) {
          return {
            items,
            total,
            limit,
            offset,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Could not list InAppInboxItems from DB: ${err.message}`);
      }
    }

    // Memory store fallback
    const all = Array.from(this.prisma.memoryStore.inboxItems.values()).filter(
      (item) =>
        item.tenantId === tenantId &&
        item.recipientUserId === userId &&
        !item.archivedAt &&
        (query?.isRead === undefined || item.isRead === (String(query.isRead) === 'true' || query.isRead === true)) &&
        (!query?.category || item.category === query.category),
    );

    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      items: all.slice(offset, offset + limit),
      total: all.length,
      limit,
      offset,
    };
  }

  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    if (this.prisma.isDbConnected) {
      try {
        const count = await this.prisma.inAppInboxItem.count({
          where: {
            tenantId,
            recipientUserId: userId,
            isRead: false,
            archivedAt: null,
          },
        });
        if (count > 0) return count;
      } catch (err: any) {
        this.logger.warn(`Could not query unread count from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.inboxItems.values()).filter(
      (item) =>
        item.tenantId === tenantId &&
        item.recipientUserId === userId &&
        !item.isRead &&
        !item.archivedAt,
    ).length;
  }

  async markAsRead(tenantId: string, userId: string, id: string) {
    const now = new Date();

    if (this.prisma.isDbConnected) {
      try {
        const item = await this.prisma.inAppInboxItem.findFirst({
          where: { id, tenantId },
        });

        if (!item) {
          throw new NotFoundException(`Notification inbox item ${id} not found.`);
        }

        if (item.recipientUserId !== userId) {
          throw new ForbiddenException(`Unauthorized access to notification ${id}.`);
        }

        return await this.prisma.inAppInboxItem.update({
          where: { id },
          data: {
            isRead: true,
            readAt: now,
          },
        });
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof ForbiddenException) throw err;
        this.logger.warn(`Could not update InAppInboxItem in DB: ${err.message}`);
      }
    }

    const item = this.prisma.memoryStore.inboxItems.get(id);
    if (!item || item.tenantId !== tenantId) {
      throw new NotFoundException(`Notification inbox item ${id} not found.`);
    }
    if (item.recipientUserId !== userId) {
      throw new ForbiddenException(`Unauthorized access to notification ${id}.`);
    }

    item.isRead = true;
    item.readAt = now;
    item.updatedAt = now;
    this.prisma.memoryStore.inboxItems.set(id, item);
    return item;
  }

  async markAllAsRead(tenantId: string, userId: string): Promise<{ count: number }> {
    const now = new Date();

    if (this.prisma.isDbConnected) {
      try {
        const result = await this.prisma.inAppInboxItem.updateMany({
          where: {
            tenantId,
            recipientUserId: userId,
            isRead: false,
            archivedAt: null,
          },
          data: {
            isRead: true,
            readAt: now,
          },
        });
        return { count: result.count };
      } catch (err: any) {
        this.logger.warn(`Could not mark all InAppInboxItems as read in DB: ${err.message}`);
      }
    }

    let count = 0;
    for (const [id, item] of this.prisma.memoryStore.inboxItems.entries()) {
      if (item.tenantId === tenantId && item.recipientUserId === userId && !item.isRead && !item.archivedAt) {
        item.isRead = true;
        item.readAt = now;
        item.updatedAt = now;
        this.prisma.memoryStore.inboxItems.set(id, item);
        count++;
      }
    }
    return { count };
  }

  async archiveInboxItem(tenantId: string, userId: string, id: string): Promise<boolean> {
    const now = new Date();

    if (this.prisma.isDbConnected) {
      try {
        const item = await this.prisma.inAppInboxItem.findFirst({
          where: { id, tenantId },
        });

        if (!item) {
          throw new NotFoundException(`Notification inbox item ${id} not found.`);
        }

        if (item.recipientUserId !== userId) {
          throw new ForbiddenException(`Unauthorized access to notification ${id}.`);
        }

        await this.prisma.inAppInboxItem.update({
          where: { id },
          data: { archivedAt: now },
        });
        return true;
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof ForbiddenException) throw err;
        this.logger.warn(`Could not archive InAppInboxItem in DB: ${err.message}`);
      }
    }

    const item = this.prisma.memoryStore.inboxItems.get(id);
    if (!item || item.tenantId !== tenantId) {
      throw new NotFoundException(`Notification inbox item ${id} not found.`);
    }
    if (item.recipientUserId !== userId) {
      throw new ForbiddenException(`Unauthorized access to notification ${id}.`);
    }

    item.archivedAt = now;
    item.updatedAt = now;
    this.prisma.memoryStore.inboxItems.set(id, item);
    return true;
  }

  async list(tenantId: string, recipientUserId?: string) {
    if (this.prisma.isDbConnected) {
      try {
        return await this.prisma.notification.findMany({
          where: {
            tenantId,
            ...(recipientUserId ? { recipientUserId } : {}),
          },
          orderBy: { createdAt: 'desc' },
        });
      } catch (err: any) {
        this.logger.warn(`Could not list notifications from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.notifications.values()).filter(
      (n) => n.tenantId === tenantId && (!recipientUserId || n.recipientUserId === recipientUserId),
    );
  }

  async send(
    tenantId: string,
    data: {
      recipientUserId?: string;
      recipientEmail?: string;
      recipientPhone?: string;
      title: string;
      message: string;
      channel?: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP';
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
      category?: 'GENERAL' | 'ANNOUNCEMENT' | 'FEE_REMINDER' | 'RESULT' | 'ATTENDANCE' | 'HOMEWORK' | 'EMERGENCY';
      actionUrl?: string;
    },
  ) {
    const id = `notif_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const now = new Date();
    const record = {
      id,
      tenantId,
      recipientUserId: data.recipientUserId || null,
      recipientEmail: data.recipientEmail || null,
      recipientPhone: data.recipientPhone || null,
      title: data.title,
      message: data.message,
      channel: (data.channel as any) || 'IN_APP',
      status: 'SENT',
      sentAt: now,
      createdAt: now,
    };

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.notification.create({
          data: record,
        });
      } catch (err: any) {
        this.logger.warn(`Could not persist Notification to DB: ${err.message}`);
      }
    }

    this.prisma.memoryStore.notifications.set(id, record);

    // If recipientUserId is provided and channel is IN_APP (or default), deliver to user inbox
    if (data.recipientUserId && (!data.channel || data.channel === 'IN_APP')) {
      await this.createInboxItem(tenantId, {
        recipientUserId: data.recipientUserId,
        notificationId: id,
        title: data.title,
        message: data.message,
        priority: data.priority || 'NORMAL',
        category: data.category || 'GENERAL',
        actionUrl: data.actionUrl,
      });
    }

    return record;
  }
}
