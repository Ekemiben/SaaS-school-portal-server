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
  }

  async createBatchInboxItems(tenantId: string, items: CreateInboxItemDto[]): Promise<number> {
    if (!items || items.length === 0) return 0;

    const now = new Date();
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
      skipDuplicates: true,
    });
    return result.count;
  }

  async listUserInbox(tenantId: string, userId: string, query?: ListInboxQueryDto) {
    const limit = query?.limit ? Math.min(Number(query.limit), 100) : 50;
    const offset = query?.offset ? Number(query.offset) : 0;

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

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    const count = await this.prisma.inAppInboxItem.count({
      where: {
        tenantId,
        recipientUserId: userId,
        isRead: false,
        archivedAt: null,
      },
    });
    return count;
  }

  async markAsRead(tenantId: string, userId: string, id: string) {
    const now = new Date();

    const item = await this.prisma.inAppInboxItem.findFirst({
      where: { id, tenantId },
    });

    if (!item) {
      throw new NotFoundException(`Notification inbox item ${id} not found.`);
    }

    if (item.recipientUserId !== userId) {
      throw new ForbiddenException(`Unauthorized access to notification ${id}.`);
    }

    return this.prisma.inAppInboxItem.update({
      where: { id },
      data: {
        isRead: true,
        readAt: now,
      },
    });
  }

  async markAllAsRead(tenantId: string, userId: string): Promise<{ count: number }> {
    const now = new Date();

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
  }

  async archiveInboxItem(tenantId: string, userId: string, id: string): Promise<boolean> {
    const now = new Date();

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
  }

  async list(tenantId: string, recipientUserId?: string) {
    return this.prisma.notification.findMany({
      where: {
        tenantId,
        ...(recipientUserId ? { recipientUserId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
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
    const record = await this.prisma.notification.create({
      data: {
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
      },
    });

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
