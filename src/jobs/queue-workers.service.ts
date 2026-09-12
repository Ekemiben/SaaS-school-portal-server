import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { RedisConnectionService } from './redis-connection.service.js';
import { QueueService } from './queue.service.js';
import { QUEUES } from './queue.constants.js';
import { NotificationProcessor } from './processors/notification.processor.js';
import { ReportProcessor } from './processors/report.processor.js';
import { ImportExportProcessor } from './processors/import-export.processor.js';
import { PaymentReconcileProcessor } from './processors/payment-reconcile.processor.js';

@Injectable()
export class QueueWorkersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueWorkersService.name);
  public workers: Map<string, Worker> = new Map();

  constructor(
    private readonly redisConn: RedisConnectionService,
    private readonly queueService: QueueService,
    private readonly notificationProcessor: NotificationProcessor,
    private readonly reportProcessor: ReportProcessor,
    private readonly importExportProcessor: ImportExportProcessor,
    private readonly paymentReconcileProcessor: PaymentReconcileProcessor,
  ) {}

  async onModuleInit() {
    if (!this.redisConn.isRedisConnected || !this.redisConn.client) {
      this.logger.log('QueueWorkersService running in local dispatch mode for dev/test.');
      return;
    }

    const processors: Record<string, (job: any) => Promise<any>> = {
      [QUEUES.NOTIFICATIONS]: (job) => this.notificationProcessor.process(job),
      [QUEUES.REPORTS]: (job) => this.reportProcessor.process(job),
      [QUEUES.IMPORT_EXPORT]: (job) => this.importExportProcessor.process(job),
      [QUEUES.PAYMENT_RECONCILE]: (job) => this.paymentReconcileProcessor.process(job),
    };

    for (const [queueName, processorFn] of Object.entries(processors)) {
      const worker = new Worker(
        queueName,
        async (job: Job) => {
          this.logger.log(`Worker starting job [${job.id}] (${job.name}) on queue [${queueName}] for tenant [${job.data.tenantId}]`);
          return await processorFn({ id: String(job.id), data: job.data });
        },
        {
          connection: this.redisConn.client.duplicate(),
          concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
        },
      );

      worker.on('completed', (job: Job) => {
        this.logger.log(`Job [${job.id}] (${job.name}) completed successfully on queue [${queueName}]`);
      });

      worker.on('failed', (job: Job | undefined, err: Error) => {
        if (!job) return;
        this.logger.warn(`Job [${job.id}] failed attempt ${job.attemptsMade}/${job.opts?.attempts ?? 3}: ${err.message}`);

        const maxAttempts = job.opts?.attempts ?? 3;
        if (job.attemptsMade >= maxAttempts) {
          this.queueService.recordDeadLetter({
            id: String(job.id),
            queueName,
            name: job.name,
            tenantId: job.data?.tenantId,
            data: job.data,
            failedReason: err.message,
            attemptsMade: job.attemptsMade,
            failedAt: new Date().toISOString(),
            stacktrace: job.stacktrace || undefined,
          });
        }
      });

      worker.on('error', (err: Error) => {
        this.logger.error(`Worker error on queue [${queueName}]: ${err.message}`);
      });

      this.workers.set(queueName, worker);
    }

    this.logger.log(`Spawned ${this.workers.size} background BullMQ queue workers.`);
  }

  /**
   * Executes a job through its registered processor directly (used in fallback/testing mode)
   */
  async executeJob(queueName: string, jobData: { id: string; name: string; data: any }): Promise<any> {
    const { id, data } = jobData;
    switch (queueName) {
      case QUEUES.NOTIFICATIONS:
        return await this.notificationProcessor.process({ id, data });
      case QUEUES.REPORTS:
        return await this.reportProcessor.process({ id, data });
      case QUEUES.IMPORT_EXPORT:
        return await this.importExportProcessor.process({ id, data });
      case QUEUES.PAYMENT_RECONCILE:
        return await this.paymentReconcileProcessor.process({ id, data });
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Gracefully stopping all BullMQ workers...');
    for (const [name, worker] of this.workers.entries()) {
      try {
        await worker.close();
      } catch (err: any) {
        this.logger.warn(`Error stopping worker for ${name}: ${err.message}`);
      }
    }
    this.workers.clear();
  }
}
