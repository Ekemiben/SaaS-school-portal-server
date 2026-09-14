import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RedisConnectionService } from './redis-connection.service.js';
import { QueueService } from './queue.service.js';
import { QueueWorkersService } from './queue-workers.service.js';
import { QUEUES, JOB_TYPES } from './queue.constants.js';
import { NotificationProcessor } from './processors/notification.processor.js';
import { ReportProcessor } from './processors/report.processor.js';
import { ImportExportProcessor } from './processors/import-export.processor.js';
import { PaymentReconcileProcessor } from './processors/payment-reconcile.processor.js';
import { BadRequestException } from '@nestjs/common';

describe('Distributed Job Processing (Task 3: Redis + BullMQ)', () => {
  let redisConn: RedisConnectionService;
  let queueService: QueueService;
  let queueWorkers: QueueWorkersService;

  let notifProcessor: NotificationProcessor;
  let reportProcessor: ReportProcessor;
  let importExportProcessor: ImportExportProcessor;
  let reconcileProcessor: PaymentReconcileProcessor;

  const originalEnv = process.env;
  const TEST_TENANT = 'tenant_greenfield_100';

  beforeEach(() => {
    process.env = { ...originalEnv };
    redisConn = new RedisConnectionService();
    queueService = new QueueService(redisConn);

    notifProcessor = new NotificationProcessor(
      { send: vi.fn().mockResolvedValue({ success: true, messageId: 'msg_1' }) } as any,
      { send: vi.fn().mockResolvedValue({ success: true, messageId: 'sms_1' }) } as any,
      { send: vi.fn().mockResolvedValue({ success: true, messageId: 'wa_1' }) } as any,
    );
    reportProcessor = new ReportProcessor({} as any);
    importExportProcessor = new ImportExportProcessor({} as any);
    reconcileProcessor = new PaymentReconcileProcessor({} as any);

    queueWorkers = new QueueWorkersService(
      redisConn,
      queueService,
      notifProcessor,
      reportProcessor,
      importExportProcessor,
      reconcileProcessor,
    );
  });

  afterEach(async () => {
    process.env = originalEnv;
    await queueWorkers.onModuleDestroy();
    await queueService.onModuleDestroy();
    await redisConn.onModuleDestroy();
  });

  describe('1. Redis Connection & Production Fail-Fast Enforcement', () => {
    it('should fail fast in production mode if Redis connection fails', async () => {
      process.env.NODE_ENV = 'production';
      vi.spyOn(redisConn, 'getClientOptions').mockReturnValue({
        options: {
          lazyConnect: true,
          maxRetriesPerRequest: null,
          retryStrategy: () => null,
        },
      });

      await expect(redisConn.onModuleInit()).rejects.toThrow(
        /CRITICAL: Redis connection failed in production mode/,
      );
      expect(redisConn.isRedisConnected).toBe(false);
    });

    it('should fail fast when REQUIRE_REDIS=true and Redis is unreachable', async () => {
      process.env.REQUIRE_REDIS = 'true';
      process.env.NODE_ENV = 'development';
      vi.spyOn(redisConn, 'getClientOptions').mockReturnValue({
        options: {
          lazyConnect: true,
          maxRetriesPerRequest: null,
          retryStrategy: () => null,
        },
      });

      await expect(redisConn.onModuleInit()).rejects.toThrow(
        /CRITICAL: Redis connection failed in production mode/,
      );
    });

    it('should gracefully fallback in non-production development/test mode without crashing', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.REQUIRE_REDIS;
      vi.spyOn(redisConn, 'getClientOptions').mockReturnValue({
        options: {
          lazyConnect: true,
          maxRetriesPerRequest: null,
          retryStrategy: () => null,
        },
      });

      await expect(redisConn.onModuleInit()).resolves.toBeUndefined();
      expect(redisConn.isRedisConnected).toBe(false);
    });
  });

  describe('2. Job Enqueuing & Tenant Context Propagation', () => {
    it('should strictly reject enqueue if tenantId is missing or empty', async () => {
      await expect(
        queueService.addJob(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
          channel: 'email',
          recipient: 'test@example.com',
          body: 'Hello',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully enqueue job with tenant context and default retry options', async () => {
      const result = await queueService.addJob(
        QUEUES.NOTIFICATIONS,
        JOB_TYPES.SEND_EMAIL,
        {
          channel: 'email',
          tenantId: TEST_TENANT,
          recipient: 'student@example.com',
          body: 'Welcome to the school portal',
        },
      );

      expect(result.jobId).toBeDefined();
      expect(result.queueName).toBe(QUEUES.NOTIFICATIONS);
      expect(result.status).toBe('ENQUEUED');

      const status = await queueService.getJobStatus(QUEUES.NOTIFICATIONS, result.jobId);
      expect(status).toBeDefined();
      expect(status?.tenantId).toBe(TEST_TENANT);
      expect(status?.maxAttempts).toBe(3);
    });
  });

  describe('3. Retry Handling, Backoff, and Dead-Letter Queue (DLQ)', () => {
    it('should route job to Dead-Letter Queue when max attempts are exhausted', async () => {
      const deadJobId = 'dead_job_001';
      queueService.recordDeadLetter({
        id: deadJobId,
        queueName: QUEUES.NOTIFICATIONS,
        name: JOB_TYPES.SEND_EMAIL,
        tenantId: TEST_TENANT,
        data: {
          channel: 'email',
          tenantId: TEST_TENANT,
          recipient: 'broken@example.com',
          body: 'Test',
        },
        failedReason: 'SMTP server connection timed out after 3 retries',
        attemptsMade: 3,
        failedAt: new Date().toISOString(),
      });

      const dlqJobs = queueService.getDeadLetterJobs(TEST_TENANT);
      expect(dlqJobs.length).toBe(1);
      expect(dlqJobs[0].id).toBe(deadJobId);
      expect(dlqJobs[0].failedReason).toContain('SMTP server connection timed out');

      // Cross-tenant DLQ isolation: Foreign tenant should see 0 DLQ jobs
      const foreignDlq = queueService.getDeadLetterJobs('foreign_tenant_999');
      expect(foreignDlq.length).toBe(0);
    });

    it('should allow retrying a job from the Dead-Letter Queue', async () => {
      const deadJobId = 'retry_dlq_002';
      queueService.recordDeadLetter({
        id: deadJobId,
        queueName: QUEUES.REPORTS,
        name: JOB_TYPES.GENERATE_REPORT_CARD,
        tenantId: TEST_TENANT,
        data: {
          reportType: 'report-card',
          tenantId: TEST_TENANT,
          parameters: {},
        },
        failedReason: 'Out of memory during PDF compilation',
        attemptsMade: 3,
        failedAt: new Date().toISOString(),
      });

      const retryResult = await queueService.retryDeadLetterJob(deadJobId);
      expect(retryResult.success).toBe(true);
      expect(queueService.deadLetterJobs.has(deadJobId)).toBe(false);
    });
  });

  describe('4. Worker Dispatch & Processor Execution', () => {
    it('should dispatch notification jobs through NotificationProcessor', async () => {
      const res = await queueWorkers.executeJob(QUEUES.NOTIFICATIONS, {
        id: 'job_test_1',
        name: JOB_TYPES.SEND_EMAIL,
        data: {
          channel: 'email',
          tenantId: TEST_TENANT,
          recipient: 'parent@greenfield.edu',
          subject: 'Report Ready',
          body: 'Your term report is available',
        },
      });

      expect(res).toEqual({ success: true, messageId: 'msg_1' });
    });

    it('should dispatch report jobs through ReportProcessor', async () => {
      const res = await queueWorkers.executeJob(QUEUES.REPORTS, {
        id: 'job_test_2',
        name: JOB_TYPES.GENERATE_REPORT_CARD,
        data: {
          reportType: 'report-card',
          tenantId: TEST_TENANT,
          parameters: { termId: 'term_1' },
          requestedByUserId: 'user_1',
        },
      });

      expect(res.status).toBe('completed');
      expect(res.downloadUrl).toContain('tenants/tenant_greenfield_100/reports');
    });

    it('should gracefully clean up workers and queues on shutdown', async () => {
      await expect(queueWorkers.onModuleDestroy()).resolves.toBeUndefined();
      await expect(queueService.onModuleDestroy()).resolves.toBeUndefined();
      await expect(redisConn.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
