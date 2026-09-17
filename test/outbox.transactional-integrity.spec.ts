import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OutboxService } from '../src/infrastructure/outbox/outbox.service.js';
import { OutboxProcessor } from '../src/infrastructure/outbox/outbox.processor.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { IJobDispatcher } from '../src/infrastructure/queues/contracts/job-dispatcher.interface.js';
import { QUEUES } from '../src/jobs/queue.constants.js';

describe('Transactional Outbox Pattern & Reliable Event Relay', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let outboxService: OutboxService;
  let outboxProcessor: OutboxProcessor;
  let mockDispatcher: IJobDispatcher;

  const TENANT_ID = 'tenant_greenfield_100';

  beforeEach(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);
    outboxService = new OutboxService(prisma, rlsHelper);

    if (prisma.isDbConnected) {
      await rlsHelper.withBypassContext(async (tx) => {
        await (tx as any).tenant.upsert({
          where: { id: TENANT_ID },
          update: {},
          create: {
            id: TENANT_ID,
            name: 'Greenfield International Academy',
            slug: `greenfield_${Date.now()}`,
          },
        });
      });
    }

    mockDispatcher = {
      dispatch: vi.fn().mockResolvedValue('job_pgboss_001'),
      dispatchBatch: vi.fn().mockResolvedValue([]),
      schedule: vi.fn().mockResolvedValue('job_pgboss_002'),
      getJobStatus: vi.fn().mockResolvedValue(null),
      cancel: vi.fn().mockResolvedValue(true),
    };

    outboxProcessor = new OutboxProcessor(outboxService, mockDispatcher);
  });

  afterEach(async () => {
    await prisma.onModuleDestroy();
  });

  it('1. Outbox Event Persistence: Successfully persists outbox event with tenant context', async () => {
    const event = await outboxService.recordEvent(
      TENANT_ID,
      'notification.email.welcome',
      { recipient: 'parent@example.com', subject: 'Welcome' },
    );

    expect(event).toBeDefined();
    expect(event.tenantId).toBe(TENANT_ID);
    expect(event.eventType).toBe('notification.email.welcome');
    expect(event.status).toBe('PENDING');
  });

  it('2. Outbox Relay & Deduplication: Outbox processor claims and dispatches pending events', async () => {
    const event = await outboxService.recordEvent(
      TENANT_ID,
      'notification.email.invoice',
      { invoiceId: 'inv_100', amount: 500 },
    );

    await outboxProcessor.processPendingEvents();

    expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
      QUEUES.NOTIFICATIONS,
      'notification.email.invoice',
      { invoiceId: 'inv_100', amount: 500 },
      TENANT_ID,
    );

    const updatedEvent = await rlsHelper.withBypassContext(async (tx) => {
      return (tx as any).outboxEvent.findUnique({ where: { id: event.id } });
    });

    expect(updatedEvent.status).toBe('PUBLISHED');
    expect(updatedEvent.publishedAt).toBeDefined();
  });

  it('3. Resilient Error Handling: Failed dispatch marks event for retry without data loss', async () => {
    const errorDispatcher: IJobDispatcher = {
      ...mockDispatcher,
      dispatch: vi.fn().mockRejectedValue(new Error('PostgreSQL connection drop')),
    };

    const failingProcessor = new OutboxProcessor(outboxService, errorDispatcher);

    const event = await outboxService.recordEvent(
      TENANT_ID,
      'report.financial',
      { year: 2026 },
    );

    await failingProcessor.processPendingEvents();

    const stored = await rlsHelper.withBypassContext(async (tx) => {
      return (tx as any).outboxEvent.findUnique({ where: { id: event.id } });
    });

    expect(stored.status).toBe('PENDING'); // Kept pending for next retry batch
    expect(stored.retryCount).toBe(1);
    expect(stored.lastError).toContain('PostgreSQL connection drop');
  });
});
