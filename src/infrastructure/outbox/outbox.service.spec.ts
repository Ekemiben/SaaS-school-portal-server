import { describe, it, expect, beforeEach } from 'vitest';
import { OutboxService } from './outbox.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RlsHelper } from '../../database/rls.helper.js';

describe('OutboxService Dual-Mode & Reliability (Constitution Section 64)', () => {
  let outboxService: OutboxService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = new PrismaService();
    // Ensure in-memory mode for test
    prisma.isDbConnected = false;
    const rlsHelper = new RlsHelper(prisma);
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
    const updatedBatch = await outboxService.fetchPendingBatch(10);
    expect(updatedBatch.some((e: any) => e.id === ev1.id)).toBe(false);
  });

  it('should increment retry count on failure and transition to FAILED when limit exceeded', async () => {
    const tenantId = 'tenant_retry_01';
    const ev = await outboxService.recordEvent(tenantId, 'EXPORT_FAILED', { error: 'timeout' });

    for (let i = 0; i < 4; i++) {
      await outboxService.markFailed(ev.id, 'Gateway timeout', 5);
    }
    const memStore = (prisma.memoryStore as any).outboxEvents;
    let stored = memStore.get(ev.id);
    expect(stored.retryCount).toBe(4);
    expect(stored.status).toBe('PENDING');

    // 5th failure exceeds maxRetries
    await outboxService.markFailed(ev.id, 'Final fatal error', 5);
    stored = memStore.get(ev.id);
    expect(stored.retryCount).toBe(5);
    expect(stored.status).toBe('FAILED');
    expect(stored.lastError).toContain('Final fatal error');
  });
});
