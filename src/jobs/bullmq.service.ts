import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue, Worker, Job, QueueOptions, WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUES, DEAD_LETTER_QUEUES, DEFAULT_JOB_OPTIONS } from './queue.constants.js';
import { TenantJobPayload, JobStatusResponse, DeadLetterPayload } from './types/job-payload.type.js';
import { NotificationProcessor } from './processors/notification.processor.js';
import { ReportProcessor } from './processors/report.processor.js';
import { ImportExportProcessor } from './processors/import-export.processor.js';
import { PaymentReconcileProcessor } from './processors/payment-reconcile.processor.js';

@Injectable()
export class BullmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullmqService.name);
  public isRedisConnected = false;

  private redisConnection: Redis | null = null;
  public queues: Map<string, Queue> = new Map();
  public dlqs: Map<string, Queue> = new Map();
  public workers: Map<string, Worker> = new Map();

  constructor(
    private readonly notificationProcessor: NotificationProcessor,
    private readonly reportProcessor: ReportProcessor,
    private readonly importExportProcessor: ImportExportProcessor,
    private readonly paymentReconcileProcessor: PaymentReconcileProcessor,
  ) {}

  async onModuleInit() {
    await this.initializeRedisAndQueues();
  }

  getRedisClient(): Redis | null {
    return this.isRedisConnected ? this.redisConnection : null;
  }

  async initializeRedisAndQueues(customConnection?: Redis) {
    try {
      if (customConnection) {
        this.redisConnection = customConnection;
        this.isRedisConnected = true;
      } else {
        const host = process.env.REDIS_HOST || 'localhost';
        const port = parseInt(process.env.REDIS_PORT || '6379', 10);
        const password = process.env.REDIS_PASSWORD || undefined;
        const tls = process.env.REDIS_TLS === 'true' ? {} : undefined;

        this.redisConnection = new Redis({
          host,
          port,
          password,
          tls,
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          lazyConnect: true,
        });

        await this.redisConnection.connect();
        this.isRedisConnected = true;
        this.logger.log(`Successfully connected to Redis cluster at ${host}:${port}`);
      }

      this.setupQueues();
      this.setupWorkers();
    } catch (error: any) {
      this.isRedisConnected = false;
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(`Critical: Unable to connect to Redis in production: ${error?.message}`);
        throw new Error(`Production Redis connection failure: ${error?.message}`);
      }
      this.logger.warn(`Redis not available (${error?.message}). Background queues running in local memory fallback.`);
    }
  }

  private setupQueues() {
    if (!this.redisConnection) return;
    const opts: QueueOptions = { connection: this.redisConnection };

    for (const [_key, queueName] of Object.entries(QUEUES)) {
      this.queues.set(queueName, new Queue(queueName, opts));
    }
    for (const [_key, dlqName] of Object.entries(DEAD_LETTER_QUEUES)) {
      this.dlqs.set(dlqName, new Queue(dlqName, opts));
    }
  }

  private setupWorkers() {
    if (!this.redisConnection) return;
    const workerOpts: WorkerOptions = {
      connection: this.redisConnection,
      concurrency: 5,
    };

    // 1. Notification Worker
    this.createWorker(QUEUES.NOTIFICATIONS, DEAD_LETTER_QUEUES.NOTIFICATIONS, async (job) => {
      return this.notificationProcessor.process({ id: job.id || 'unknown', data: job.data.data });
    }, workerOpts);

    // 2. Report Worker
    this.createWorker(QUEUES.REPORTS, DEAD_LETTER_QUEUES.REPORTS, async (job) => {
      return this.reportProcessor.process({ id: job.id || 'unknown', data: job.data.data });
    }, workerOpts);

    // 3. Import/Export Worker
    this.createWorker(QUEUES.IMPORT_EXPORT, DEAD_LETTER_QUEUES.IMPORT_EXPORT, async (job) => {
      return this.importExportProcessor.process({ id: job.id || 'unknown', data: job.data.data });
    }, workerOpts);

    // 4. Payment Reconcile Worker
    this.createWorker(QUEUES.PAYMENT_RECONCILE, DEAD_LETTER_QUEUES.PAYMENT_RECONCILE, async (job) => {
      return this.paymentReconcileProcessor.process({ id: job.id || 'unknown', data: job.data.data });
    }, workerOpts);
  }

  private createWorker(
    queueName: string,
    dlqName: string,
    handler: (job: Job) => Promise<any>,
    opts: WorkerOptions,
  ) {
    const worker = new Worker(queueName, handler, opts);

    worker.on('completed', (job: Job) => {
      this.logger.log(`Job [${job.name}] #${job.id} completed on queue "${queueName}" for tenant "${job.data?.tenantId}"`);
    });

    worker.on('failed', async (job: Job | undefined, err: Error) => {
      if (!job) return;
      this.logger.error(`Job [${job.name}] #${job.id} failed on queue "${queueName}": ${err.message} (attempt ${job.attemptsMade}/${job.opts.attempts || 3})`);

      // If all retry attempts are exhausted, route to Dead Letter Queue (DLQ)
      if (job.attemptsMade >= (job.opts.attempts || DEFAULT_JOB_OPTIONS.attempts)) {
        await this.routeToDlq(dlqName, job, err);
      }
    });

    this.workers.set(queueName, worker);
  }

  private async routeToDlq(dlqName: string, job: Job, err: Error) {
    const dlq = this.dlqs.get(dlqName);
    if (!dlq) return;

    const deadLetterData: DeadLetterPayload = {
      originalJobId: job.id || 'unknown',
      originalQueue: job.queueName,
      jobName: job.name,
      tenantId: job.data?.tenantId || 'unknown',
      payload: job.data,
      failedReason: err.message,
      stacktrace: job.stacktrace,
      failedAt: new Date().toISOString(),
      attemptsMade: job.attemptsMade,
    };

    await dlq.add(`dlq-${job.name}`, deadLetterData, { removeOnComplete: false });
    this.logger.warn(`Job #${job.id} permanently failed. Routed to Dead-Letter Queue: "${dlqName}"`);
  }

  async dispatch<T>(
    queueName: string,
    jobName: string,
    payload: TenantJobPayload<T>,
    customOptions?: Record<string, any>,
  ): Promise<{ jobId: string; queue: string }> {
    if (!payload.tenantId) {
      throw new Error('Tenant context required: payload.tenantId cannot be empty.');
    }

    const payloadWithMeta: TenantJobPayload<T> = {
      ...payload,
      createdAt: payload.createdAt || new Date().toISOString(),
    };

    const queue = this.queues.get(queueName);
    if (this.isRedisConnected && queue) {
      const job = await queue.add(jobName, payloadWithMeta, {
        ...DEFAULT_JOB_OPTIONS,
        ...customOptions,
      });
      return { jobId: job.id || 'unknown', queue: queueName };
    }

    // Resilient fallback execution when Redis is offline in dev/test
    const mockId = `job_fallback_${Date.now()}`;
    this.executeFallback(queueName, jobName, mockId, payloadWithMeta);
    return { jobId: mockId, queue: queueName };
  }

  private async executeFallback(queueName: string, jobName: string, jobId: string, payload: TenantJobPayload) {
    try {
      if (queueName === QUEUES.NOTIFICATIONS) {
        await this.notificationProcessor.process({ id: jobId, data: payload.data });
      } else if (queueName === QUEUES.REPORTS) {
        await this.reportProcessor.process({ id: jobId, data: payload.data });
      } else if (queueName === QUEUES.IMPORT_EXPORT) {
        await this.importExportProcessor.process({ id: jobId, data: payload.data });
      } else if (queueName === QUEUES.PAYMENT_RECONCILE) {
        await this.paymentReconcileProcessor.process({ id: jobId, data: payload.data });
      }
    } catch (err: any) {
      this.logger.warn(`Fallback execution for job ${jobId} failed: ${err?.message}`);
    }
  }

  async getJobStatus(queueName: string, jobId: string): Promise<JobStatusResponse | null> {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    return {
      id: job.id || jobId,
      name: job.name,
      queue: queueName,
      status: state as any,
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts || DEFAULT_JOB_OPTIONS.attempts,
      timestamp: job.timestamp,
      tenantId: job.data?.tenantId,
    };
  }

  async onModuleDestroy() {
    for (const [name, worker] of this.workers) {
      try {
        await worker.close();
      } catch (err: any) {
        this.logger.warn(`Error closing worker for ${name}: ${err?.message}`);
      }
    }
    for (const [name, queue] of this.queues) {
      try {
        await queue.close();
      } catch (err: any) {
        this.logger.warn(`Error closing queue ${name}: ${err?.message}`);
      }
    }
    for (const [name, dlq] of this.dlqs) {
      try {
        await dlq.close();
      } catch (err: any) {
        this.logger.warn(`Error closing DLQ ${name}: ${err?.message}`);
      }
    }
    if (this.redisConnection) {
      try {
        this.redisConnection.disconnect();
      } catch (err: any) {
        this.logger.warn(`Error disconnecting Redis: ${err?.message}`);
      }
    }
  }
}
