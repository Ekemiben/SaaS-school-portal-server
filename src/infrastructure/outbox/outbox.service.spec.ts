import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutboxService } from './outbox.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RlsHelper } from '../../database/rls.helper.js';

describe('OutboxService Direct Database Operations & Reliability', () => {
  let outboxService: OutboxService;
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let outboxEventsMap: Map<string, any>;

  beforeEach(() => {
    outboxEventsMap = new Map();

    const mockOutboxModel = {
      create: vi.fn(async ({ data }: any) => {
        const id = `outbox_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const record = {
          id,
          tenantId: data.tenantId,
          eventType: data.eventType,
          payload: data.payload || {},
          status: data.status || 'PENDING',
          retryCount: 0,
          lastError: null,
          lockedAt: null,
          lockedBy: null,
          publishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        outboxEventsMap.set(id, record);
        return record;
      }),
      findMany: vi.fn(async ({ where, take }: any) => {
        const list = Array.from(outboxEventsMap.values()).filter((e) => {
          if (where?.status && e.status !== where.status) return false;
          return true;
        });
        return list.slice(0, take || 50);
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        return outboxEventsMap.get(where.id) || null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const record = outboxEventsMap.get(where.id);
        if (record) {
          Object.assign(record, data, { updatedAt: new Date() });
          outboxEventsMap.set(where.id, record);
        }
        return record;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const [id, record] of outboxEventsMap.entries()) {
          if (where.id && id !== where.id) continue;
          if (where.status && record.status !== where.status) continue;
          Object.assign(record, data, { updatedAt: new Date() });
          outboxEventsMap.set(id, record);
          count++;
        }
        return { count };
      }),
    };

    prisma = {
      outboxEvent: mockOutboxModel,
    } as unknown as PrismaService;

    rlsHelper = {
      withTenantContext: vi.fn(async (_tenantId: string, fn: any) => fn(prisma)),
      withBypassContext: vi.fn(async (fn: any) => fn(prisma)),
    } as unknown as RlsHelper;

    outboxService = new OutboxService(prisma, rlsHelper);
  });

  it('should record an outbox event with pending status and valid payload', async () => {
    const tenantId = 'tenant_test_100';
    const event = await outboxService.recordEvent(tenantId, 'PAYMENT_VERIFIED', {
      amount: 50000,
      currency: 'NGN',
      reference: 'REF-12345',
    });

    expect(event).toBeDefined();
    expect(event.id).toMatch(/^outbox_/);
    expect(event.tenantId).toBe(tenantId);
    expect(event.eventType).toBe('PAYMENT_VERIFIED');
    expect(event.status).toBe('PENDING');
    expect(event.payload.amount).toBe(50000);
  });

  it('should reject recording event without valid tenantId', async () => {
    await expect(
      outboxService.recordEvent('', 'STUDENT_ENROLLED', {}),
    ).rejects.toThrow('Outbox event requires a valid tenantId.');
  });

  it('should fetch pending events and claim them for worker processing', async () => {
    const tenantId = 'tenant_relay_01';
    const ev1 = await outboxService.recordEvent(tenantId, 'ATTENDANCE_CORRECTED', { id: 1 });
    const ev2 = await outboxService.recordEvent(tenantId, 'PAYMENT_VERIFIED', { id: 2 });

    const batch = await outboxService.fetchPendingBatch(10);
    expect(batch.length).toBeGreaterThanOrEqual(2);

    const claimed = await outboxService.claimEvent(ev1.id, 'worker_node_alpha');
    expect(claimed).toBe(true);

    // Marking published
    await outboxService.markPublished(ev1.id);
    const publishedRecord = outboxEventsMap.get(ev1.id);
    expect(publishedRecord.status).toBe('PUBLISHED');
  });

  it('should increment retry count on failure and transition to FAILED when limit exceeded', async () => {
    const tenantId = 'tenant_retry_01';
    const ev = await outboxService.recordEvent(tenantId, 'EXPORT_FAILED', { error: 'timeout' });

    for (let i = 0; i < 4; i++) {
      await outboxService.markFailed(ev.id, 'Gateway timeout', 5);
    }
    let stored = outboxEventsMap.get(ev.id);
    expect(stored.retryCount).toBe(4);
    expect(stored.status).toBe('PENDING');

    // 5th failure exceeds maxRetries
    await outboxService.markFailed(ev.id, 'Final fatal error', 5);
    stored = outboxEventsMap.get(ev.id);
    expect(stored.retryCount).toBe(5);
    expect(stored.status).toBe('FAILED');
    expect(stored.lastError).toContain('Final fatal error');
  });
});
