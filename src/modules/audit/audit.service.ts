import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: {
    tenantId: string;
    actorUserId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    beforeData?: any;
    afterData?: any;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  }) {
    const id = `audit_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const record = {
      id,
      ...entry,
      createdAt: new Date(),
    };
    this.prisma.memoryStore.auditLogs.set(id, record);
    return record;
  }

  async list(tenantId: string, limit = 50) {
    return Array.from(this.prisma.memoryStore.auditLogs.values())
      .filter((a) => a.tenantId === tenantId)
      .slice(0, limit);
  }
}
