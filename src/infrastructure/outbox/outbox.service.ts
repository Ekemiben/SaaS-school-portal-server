import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { RlsHelper } from '../../database/rls.helper.js';

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

  /**
   * Persists an event into the transactional outbox table.
   * If a transaction client (tx) is provided, uses it to guarantee atomic persistence alongside business entities.
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
