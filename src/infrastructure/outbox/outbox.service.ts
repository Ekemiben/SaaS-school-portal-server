import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { RlsHelper } from '../../database/rls.helper.js';
import { randomUUID } from 'crypto';

export interface CreateOutboxEventDto {
  tenantId: string;
  eventType: string;
  payload: Record<string, any>;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsHelper: RlsHelper,
  ) {}

  private getMemoryStore(): Map<string, any> {
    const memory = this.prisma.memoryStore as any;
    if (!memory.outboxEvents) {
      memory.outboxEvents = new Map<string, any>();
    }
    return memory.outboxEvents;
  }

  /**
   * Persists an event into the transactional outbox table.
   * If a transaction client (tx) is provided, uses it to guarantee atomic persistence alongside business entities.
   * Fully supports dual-mode: PostgreSQL when connected, in-memory store in local/test fallback mode.
   */
  async recordEvent(
    tenantId: string,
    eventType: string,
    payload: Record<string, any>,
    tx?: any,
  ): Promise<any> {
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new BadRequestException('Outbox event requires a valid tenantId.');
    }
    if (!eventType || typeof eventType !== 'string') {
      throw new BadRequestException('Outbox event requires a valid eventType.');
    }

    if (!this.prisma.isDbConnected) {
      const memoryStore = this.getMemoryStore();
      const eventId = `outbox_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      const newEvent = {
        id: eventId,
        tenantId: tenantId.trim(),
        eventType: eventType.trim(),
        payload: payload || {},
        status: 'PENDING',
        retryCount: 0,
        lastError: null,
        lockedAt: null,
        lockedBy: null,
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      memoryStore.set(eventId, newEvent);
      this.logger.debug(`[Outbox] Recorded event [${eventType}] in memory store for tenant ${tenantId}`);
      return newEvent;
    }

    const client = tx || this.prisma;

    if (tx) {
      return (client as any).outboxEvent.create({
        data: {
          tenantId: tenantId.trim(),
          eventType: eventType.trim(),
          payload: payload || {},
          status: 'PENDING',
        },
      });
    }

    return this.rlsHelper.withTenantContext(tenantId, async (tenantTx) => {
      return (tenantTx as any).outboxEvent.create({
        data: {
          tenantId: tenantId.trim(),
          eventType: eventType.trim(),
          payload: payload || {},
          status: 'PENDING',
        },
      });
    });
  }

  /**
   * Fetches batch of pending outbox events across tenants for asynchronous dispatching.
   * Uses bypass RLS to read all pending events across tenants for relaying.
   */
  async fetchPendingBatch(limit = 50): Promise<any[]> {
    if (!this.prisma.isDbConnected) {
      const memoryStore = this.getMemoryStore();
      const now = new Date();
      const lockThreshold = new Date(now.getTime() - 60000); // 1 minute stale lock threshold
      return Array.from(memoryStore.values())
        .filter(
          (e: any) =>
            e.status === 'PENDING' && (!e.lockedAt || new Date(e.lockedAt) < lockThreshold),
        )
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, limit);
    }

    return this.rlsHelper.withBypassContext(async (bypassTx) => {
      const now = new Date();
      const lockThreshold = new Date(now.getTime() - 60000); // 1 minute stale lock threshold

      return (bypassTx as any).outboxEvent.findMany({
        where: {
          status: 'PENDING',
          OR: [
            { lockedAt: null },
            { lockedAt: { lt: lockThreshold } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
    });
  }

  /**
   * Claims/locks an event for processing by a worker node.
   */
  async claimEvent(id: string, workerId: string): Promise<boolean> {
    if (!this.prisma.isDbConnected) {
      const memoryStore = this.getMemoryStore();
      const event = memoryStore.get(id);
      if (event && event.status === 'PENDING') {
        event.lockedAt = new Date();
        event.lockedBy = workerId;
        return true;
      }
      return false;
    }

    return this.rlsHelper.withBypassContext(async (bypassTx) => {
      const result = await (bypassTx as any).outboxEvent.updateMany({
        where: {
          id,
          status: 'PENDING',
        },
        data: {
          lockedAt: new Date(),
          lockedBy: workerId,
        },
      });
      return result.count > 0;
    });
  }

  /**
   * Marks an outbox event as successfully published to the background queue.
   */
  async markPublished(id: string): Promise<void> {
    if (!this.prisma.isDbConnected) {
      const memoryStore = this.getMemoryStore();
      const event = memoryStore.get(id);
      if (event) {
        event.status = 'PUBLISHED';
        event.publishedAt = new Date();
        event.lockedAt = null;
        event.lockedBy = null;
      }
      return;
    }

    await this.rlsHelper.withBypassContext(async (bypassTx) => {
      await (bypassTx as any).outboxEvent.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
    });
  }

  /**
   * Records failure on an outbox event, incrementing retry count.
   */
  async markFailed(id: string, error: string, maxRetries = 5): Promise<void> {
    if (!this.prisma.isDbConnected) {
      const memoryStore = this.getMemoryStore();
      const event = memoryStore.get(id);
      if (event) {
        const newRetryCount = (event.retryCount || 0) + 1;
        event.retryCount = newRetryCount;
        event.status = newRetryCount >= maxRetries ? 'FAILED' : 'PENDING';
        event.lastError = error.substring(0, 1000);
        event.lockedAt = null;
        event.lockedBy = null;
      }
      return;
    }

    await this.rlsHelper.withBypassContext(async (bypassTx) => {
      const event = await (bypassTx as any).outboxEvent.findUnique({ where: { id } });
      if (!event) return;

      const newRetryCount = (event.retryCount || 0) + 1;
      const status = newRetryCount >= maxRetries ? 'FAILED' : 'PENDING';

      await (bypassTx as any).outboxEvent.update({
        where: { id },
        data: {
          status,
          retryCount: newRetryCount,
          lastError: error.substring(0, 1000),
          lockedAt: null,
          lockedBy: null,
        },
      });
    });
  }
}
