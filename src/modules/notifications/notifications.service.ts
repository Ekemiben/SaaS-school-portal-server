import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, recipientUserId?: string) {
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
    },
  ) {
    const id = `notif_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const record = {
      id,
      tenantId,
      recipientUserId: data.recipientUserId || null,
      recipientEmail: data.recipientEmail || null,
      recipientPhone: data.recipientPhone || null,
      title: data.title,
      message: data.message,
      channel: data.channel || 'IN_APP',
      status: 'SENT',
      sentAt: new Date(),
      createdAt: new Date(),
    };

    this.prisma.memoryStore.notifications.set(id, record);
    return record;
  }
}
