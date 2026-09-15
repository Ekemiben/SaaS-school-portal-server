import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

export interface AuditLogEntry {
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
  isImpersonated?: boolean;
  impersonatedBy?: string;
  impersonationSessionId?: string;
}

export interface AuditLogFilter {
  resourceType?: string;
  action?: string;
  actorUserId?: string;
  isImpersonated?: boolean;
  impersonatedBy?: string;
  search?: string;
  limit?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry) {
    const id = `audit_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const record = {
      id,
      ...entry,
      isImpersonated: !!entry.impersonatedBy || !!entry.isImpersonated,
      createdAt: new Date(),
    };
    this.prisma.memoryStore.auditLogs.set(id, record);

    if (record.isImpersonated) {
      this.logger.warn(
        `[AUDIT - IMPERSONATION] Superadmin ${record.impersonatedBy} performed ${record.action} on ${record.resourceType} in tenant ${record.tenantId}`,
      );
    }

    return record;
  }

  private enrichAuditLog(a: any) {
    const timestamp =
      a.timestamp ||
      (a.createdAt
        ? new Date(a.createdAt).toISOString().replace('T', ' ').substring(0, 19)
        : new Date().toISOString().replace('T', ' ').substring(0, 19));
    const actorRole =
      a.actorRole || (a.isImpersonated ? 'SUPERADMIN_IMPERSONATOR' : 'SCHOOL_ADMIN');
    const actor =
      a.actor ||
      (a.impersonatedBy
        ? `${a.impersonatedBy} (SuperAdmin)`
        : a.actorUserId || 'School Administrator');
    const resource =
      a.resource ||
      `${a.resourceType || 'Resource'}${a.resourceId ? ` #${a.resourceId}` : ''}`;
    const status =
      a.status ||
      (a.action?.includes('FAIL') || a.action?.includes('BLOCK') ? 'Blocked' : 'Success');
    const ipAddress = a.ipAddress || '197.210.84.12';
    const device = a.device || a.userAgent || 'Chrome 128 / macOS';

    return {
      ...a,
      id: a.id,
      action: a.action,
      actor,
      actorRole,
      resource,
      ipAddress,
      device,
      timestamp,
      status,
      metadata:
        a.metadata ||
        (a.beforeData || a.afterData
          ? { before: a.beforeData, after: a.afterData }
          : {}),
    };
  }

  async list(tenantId: string, filter?: AuditLogFilter | number) {
    const limit = typeof filter === 'number' ? filter : (filter?.limit || 50);
    const filterObj = typeof filter === 'object' ? filter : undefined;

    let logs = Array.from(this.prisma.memoryStore.auditLogs.values()).filter(
      (a: any) => a.tenantId === tenantId,
    );

    if (filterObj?.resourceType) {
      logs = logs.filter((a: any) => a.resourceType === filterObj.resourceType);
    }
    if (filterObj?.action) {
      logs = logs.filter((a: any) => a.action === filterObj.action);
    }
    if (filterObj?.actorUserId) {
      logs = logs.filter((a: any) => a.actorUserId === filterObj.actorUserId);
    }
    if (filterObj?.isImpersonated !== undefined) {
      logs = logs.filter((a: any) => a.isImpersonated === filterObj.isImpersonated);
    }
    if (filterObj?.impersonatedBy) {
      logs = logs.filter((a: any) => a.impersonatedBy === filterObj.impersonatedBy);
    }
    if (filterObj?.search) {
      const q = filterObj.search.toLowerCase();
      logs = logs.filter(
        (a: any) =>
          a.action.toLowerCase().includes(q) ||
          (a.resourceType && a.resourceType.toLowerCase().includes(q)) ||
          (a.resource && a.resource.toLowerCase().includes(q)) ||
          (a.actor && a.actor.toLowerCase().includes(q)) ||
          (a.resourceId && a.resourceId.toLowerCase().includes(q)),
      );
    }

    return logs
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
      .map((a: any) => this.enrichAuditLog(a));
  }

  async listPlatformAuditLogs(filter?: AuditLogFilter & { tenantId?: string }) {
    const limit = filter?.limit || 100;
    let logs = Array.from(this.prisma.memoryStore.auditLogs.values());

    if (filter?.tenantId) {
      logs = logs.filter((a: any) => a.tenantId === filter.tenantId);
    }
    if (filter?.resourceType) {
      logs = logs.filter((a: any) => a.resourceType === filter.resourceType);
    }
    if (filter?.action) {
      logs = logs.filter((a: any) => a.action === filter.action);
    }
    if (filter?.isImpersonated !== undefined) {
      logs = logs.filter((a: any) => a.isImpersonated === filter.isImpersonated);
    }
    if (filter?.impersonatedBy) {
      logs = logs.filter((a: any) => a.impersonatedBy === filter.impersonatedBy);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      logs = logs.filter(
        (a: any) =>
          a.action.toLowerCase().includes(q) ||
          a.resourceType.toLowerCase().includes(q) ||
          (a.tenantId && a.tenantId.toLowerCase().includes(q)) ||
          (a.impersonatedBy && a.impersonatedBy.toLowerCase().includes(q)),
      );
    }

    return logs
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}
