import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueService } from '../src/jobs/queue.service.js';
import { PgBossDispatcher } from '../src/infrastructure/queues/pg-boss/pg-boss.dispatcher.js';
import { PgBossService } from '../src/infrastructure/queues/pg-boss/pg-boss.service.js';
import { QUEUES, JOB_TYPES } from '../src/jobs/queue.constants.js';
import { ConfigService } from '@nestjs/config';

describe('Dead-Letter Queue (DLQ), Retries, and Backoff Architecture', () => {
  let pgBossService: PgBossService;
  let dispatcher: PgBossDispatcher;
  let queueService: QueueService;

  const TENANT_A = 'tenant_dlq_001';
  const TENANT_B = 'tenant_dlq_002';

  beforeEach(async () => {
    const mockConfig = {
      get: vi.fn(() => undefined),
    } as unknown as ConfigService;

    pgBossService = new PgBossService(mockConfig);
    await pgBossService.start();
    dispatcher = new PgBossDispatcher(pgBossService);
    queueService = new QueueService(dispatcher, pgBossService);
  });

  it('1. Exponential Backoff & Retry Envelope: Configures retry parameters in job envelope', async () => {
    const res = await queueService.addJob(
      QUEUES.NOTIFICATIONS,
      JOB_TYPES.SEND_SMS,
      {
        channel: 'sms',
        tenantId: TENANT_A,
        recipient: '+2348012345678',
        body: 'Urgent notice',
      },
      {
        attempts: 5,
        backoffDelay: 2000,
      },
    );

    expect(res.jobId).toBeDefined();
    expect(res.status).toBe('ENQUEUED');

    const status = await queueService.getJobStatus(QUEUES.NOTIFICATIONS, res.jobId);
    expect(status?.maxAttempts).toBe(5);
  });

  it('2. DLQ Isolation: Dead letter jobs are partitioned by tenant', async () => {
    queueService.recordDeadLetter({
      id: 'dlq_a_1',
      queueName: QUEUES.NOTIFICATIONS,
      name: JOB_TYPES.SEND_SMS,
      tenantId: TENANT_A,
      data: { recipient: '+2348000000001', tenantId: TENANT_A },
      failedReason: 'Network timeout after 5 attempts',
      attemptsMade: 5,
      failedAt: new Date().toISOString(),
    });

    queueService.recordDeadLetter({
      id: 'dlq_b_1',
      queueName: QUEUES.REPORTS,
      name: JOB_TYPES.GENERATE_REPORT_CARD,
      tenantId: TENANT_B,
      data: { termId: 'term_1', tenantId: TENANT_B },
      failedReason: 'Template render error',
      attemptsMade: 3,
      failedAt: new Date().toISOString(),
    });

    const tenantAJobs = queueService.getDeadLetterJobs(TENANT_A);
    expect(tenantAJobs.length).toBe(1);
    expect(tenantAJobs[0].id).toBe('dlq_a_1');

    const tenantBJobs = queueService.getDeadLetterJobs(TENANT_B);
    expect(tenantBJobs.length).toBe(1);
    expect(tenantBJobs[0].id).toBe('dlq_b_1');
  });

  it('3. DLQ Re-queueing: Successfully retries dead letter job', async () => {
    const deadJobId = 'dlq_retry_test';
    queueService.recordDeadLetter({
      id: deadJobId,
      queueName: QUEUES.NOTIFICATIONS,
      name: JOB_TYPES.SEND_EMAIL,
      tenantId: TENANT_A,
      data: { channel: 'email', recipient: 'parent@alpha.edu', tenantId: TENANT_A, body: 'Hello' },
      failedReason: 'Gateway 503',
      attemptsMade: 3,
      failedAt: new Date().toISOString(),
    });

    const retryResult = await queueService.retryDeadLetterJob(deadJobId);
    expect(retryResult.success).toBe(true);
    expect(queueService.getDeadLetterJobs(TENANT_A).length).toBe(0);
  });
});
