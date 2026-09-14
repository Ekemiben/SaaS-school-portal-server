import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BullmqService } from '../src/jobs/bullmq.service.js';
import { QUEUES, DEAD_LETTER_QUEUES, DEFAULT_JOB_OPTIONS, JOB_TYPES } from '../src/jobs/queue.constants.js';
import { NotificationProcessor } from '../src/jobs/processors/notification.processor.js';
import { ReportProcessor } from '../src/jobs/processors/report.processor.js';
import { ImportExportProcessor } from '../src/jobs/processors/import-export.processor.js';
import { PaymentReconcileProcessor } from '../src/jobs/processors/payment-reconcile.processor.js';
import { EmailAdapter } from '../src/modules/notifications/adapters/email.adapter.js';
import { SmsAdapter } from '../src/modules/notifications/adapters/sms.adapter.js';
import { WhatsAppAdapter } from '../src/modules/notifications/adapters/whatsapp.adapter.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Redis + BullMQ Distributed Job Processing (Task 3)', () => {
  let bullmqService: BullmqService;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    const emailAdapter = new EmailAdapter();
    const smsAdapter = new SmsAdapter();
    const whatsAppAdapter = new WhatsAppAdapter();

    const notificationProcessor = new NotificationProcessor(emailAdapter, smsAdapter, whatsAppAdapter);
    const reportProcessor = new ReportProcessor(prisma);
    const importExportProcessor = new ImportExportProcessor(prisma);
    const paymentReconcileProcessor = new PaymentReconcileProcessor(prisma);

    bullmqService = new BullmqService(
      notificationProcessor,
      reportProcessor,
      importExportProcessor,
      paymentReconcileProcessor,
    );

    await bullmqService.onModuleInit();
  });

  afterAll(async () => {
    await bullmqService.onModuleDestroy();
  });

  it('1. Queue & DLQ Topology: Registers standard queues and dead-letter queues', () => {
    expect(QUEUES.NOTIFICATIONS).toBe('notifications-queue');
    expect(QUEUES.REPORTS).toBe('reports-queue');
    expect(QUEUES.IMPORT_EXPORT).toBe('import-export-queue');
    expect(QUEUES.PAYMENT_RECONCILE).toBe('payment-reconcile-queue');

    expect(DEAD_LETTER_QUEUES.NOTIFICATIONS).toBe('notifications-dlq');
    expect(DEAD_LETTER_QUEUES.REPORTS).toBe('reports-dlq');
    expect(DEAD_LETTER_QUEUES.IMPORT_EXPORT).toBe('import-export-dlq');
    expect(DEAD_LETTER_QUEUES.PAYMENT_RECONCILE).toBe('payment-reconcile-dlq');
  });

  it('2. Retry & Exponential Backoff: Enforces 3 retries and exponential delay by default', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff.type).toBe('exponential');
    expect(DEFAULT_JOB_OPTIONS.backoff.delay).toBe(1000);
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toBe(false);
  });

  it('3. Tenant Context Enforcement: Requires tenantId on all job dispatches', async () => {
    // Missing tenantId must throw
    await expect(
      bullmqService.dispatch(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
        tenantId: '',
        data: { channel: 'email', recipient: 'test@example.com', body: 'Hello' },
      }),
    ).rejects.toThrow(/Tenant context required/);
  });

  it('4. Job Dispatch & Metadata: Dispatches notification jobs with full tenant metadata', async () => {
    const testTenantId = 'tenant_greenfield_100';
    const result = await bullmqService.dispatch(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
      tenantId: testTenantId,
      userId: 'user_001',
      data: {
        channel: 'email',
        tenantId: testTenantId,
        recipient: 'parent@greenfield.edu.ng',
        subject: 'Term 1 Report Card Ready',
        body: 'Your child report card is now available.',
      },
    });

    expect(result.jobId).toBeDefined();
    expect(result.queue).toBe(QUEUES.NOTIFICATIONS);
  });

  it('5. Report Generation Dispatch: Dispatches asynchronous report tasks with tenant boundary', async () => {
    const testTenantId = 'tenant_greenfield_100';
    const result = await bullmqService.dispatch(QUEUES.REPORTS, JOB_TYPES.GENERATE_REPORT_CARD, {
      tenantId: testTenantId,
      userId: 'user_teacher_01',
      campusId: 'campus_main_01',
      data: {
        reportType: 'report-card',
        tenantId: testTenantId,
        campusId: 'campus_main_01',
        parameters: { studentId: 'std_01', termId: 'term_1' },
        requestedByUserId: 'user_teacher_01',
      },
    });

    expect(result.jobId).toBeDefined();
    expect(result.queue).toBe(QUEUES.REPORTS);
  });

  it('6. Production Fail-Fast: Refuses to silently bypass Redis in production mode', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevPort = process.env.REDIS_PORT;

    try {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_PORT = '9998'; // offline port

      const emailAdapter = new EmailAdapter();
      const smsAdapter = new SmsAdapter();
      const whatsAppAdapter = new WhatsAppAdapter();
      const notifProc = new NotificationProcessor(emailAdapter, smsAdapter, whatsAppAdapter);
      const repProc = new ReportProcessor(prisma);
      const impProc = new ImportExportProcessor(prisma);
      const payProc = new PaymentReconcileProcessor(prisma);

      const prodService = new BullmqService(notifProc, repProc, impProc, payProc);
      await expect(prodService.onModuleInit()).rejects.toThrow(/Production Redis connection failure/);
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.REDIS_PORT = prevPort;
    }
  });

  it('7. Graceful Shutdown: module destroy cleanly shuts down without unhandled rejections', async () => {
    const emailAdapter = new EmailAdapter();
    const smsAdapter = new SmsAdapter();
    const whatsAppAdapter = new WhatsAppAdapter();
    const notifProc = new NotificationProcessor(emailAdapter, smsAdapter, whatsAppAdapter);
    const repProc = new ReportProcessor(prisma);
    const impProc = new ImportExportProcessor(prisma);
    const payProc = new PaymentReconcileProcessor(prisma);

    const tempService = new BullmqService(notifProc, repProc, impProc, payProc);
    await tempService.onModuleInit();
    await expect(tempService.onModuleDestroy()).resolves.toBeUndefined();
  });
});
