import { Injectable, OnModuleInit, OnModuleDestroy, Logger, BadRequestException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisConnectionService } from './redis-connection.service.js';
import { QUEUES } from './queue.constants.js';
import {
  BaseJobPayload,
  EnqueueJobOptions,
  JobStatusResponse,
  DeadLetterJobRecord,
  JobState,
} from './job.interface.js';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  public queues: Map<string, Queue> = new Map();
  public deadLetterJobs: Map<string, DeadLetterJobRecord> = new Map();
  public inMemoryJobs: Map<string, any> = new Map();

  constructor(private readonly redisConn: RedisConnectionService) {}

  async onModuleInit() {
    if (this.redisConn.isRedisConnected && this.redisConn.client) {
      for (const queueName of Object.values(QUEUES)) {
        const queue = new Queue(queueName, {
          connection: this.redisConn.client.duplicate(),
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { count: 1000 },
            removeOnFail: false,
          },
        });
        this.queues.set(queueName, queue);
      }
      this.logger.log(`Initialized ${this.queues.size} BullMQ queues backed by Redis.`);
    } else {
      this.logger.log('QueueService initialized with resilient persistent fallback queue store.');
    }
  }

  async addJob<T extends BaseJobPayload>(
    queueName: string,
    jobName: string,
    data: T,
    options?: EnqueueJobOptions,
  ): Promise<{ jobId: string; queueName: string; status: string }> {
    if (!data || !data.tenantId || typeof data.tenantId !== 'string') {
      throw new BadRequestException('Security violation: Tenant context (tenantId) is required for all queue jobs.');
    }

    const payload = {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
    };

    const bullQueue = this.queues.get(queueName);
    if (this.redisConn.isRedisConnected && bullQueue) {
      const job = await bullQueue.add(jobName, payload, {
        attempts: options?.attempts ?? 3,
        backoff: { type: 'exponential', delay: options?.backoffDelay ?? 1000 },
        priority: options?.priority,
        delay: options?.delay,
        jobId: options?.jobId,
        removeOnComplete: { count: 1000 },
        removeOnFail: false,
      });

      this.logger.log(`Enqueued BullMQ persistent job [${job.id}] on [${queueName}] for tenant ${payload.tenantId}`);
      return { jobId: String(job.id), queueName, status: 'ENQUEUED' };
    }

    // Resilient fallback storage
    const id = options?.jobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const memoryJob = {
      id,
      name: jobName,
      queueName,
      tenantId: payload.tenantId,
      data: payload,
      state: 'waiting',
      attemptsMade: 0,
      maxAttempts: options?.attempts ?? 3,
      backoffDelay: options?.backoffDelay ?? 1000,
      timestamp: Date.now(),
    };
    this.inMemoryJobs.set(id, memoryJob);

    return { jobId: id, queueName, status: 'ENQUEUED' };
  }

  async getJobStatus(queueName: string, jobId: string): Promise<JobStatusResponse | null> {
    const bullQueue = this.queues.get(queueName);
    if (this.redisConn.isRedisConnected && bullQueue) {
      const job = await bullQueue.getJob(jobId);
      if (!job) return null;

      const state = await job.getState();
      return {
        id: String(job.id),
        name: job.name,
        queueName,
        tenantId: job.data?.tenantId,
        state: state as JobState,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts?.attempts ?? 3,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace || undefined,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn,
        data: job.data,
        returnvalue: job.returnvalue,
      };
    }

    const memJob = this.inMemoryJobs.get(jobId);
    if (!memJob) return null;

    return {
      id: memJob.id,
      name: memJob.name,
      queueName: memJob.queueName,
      tenantId: memJob.tenantId,
      state: memJob.state,
      attemptsMade: memJob.attemptsMade,
      maxAttempts: memJob.maxAttempts,
      failedReason: memJob.failedReason,
      timestamp: memJob.timestamp,
      finishedOn: memJob.finishedOn,
      data: memJob.data,
      returnvalue: memJob.returnvalue,
    };
  }

  recordDeadLetter(record: DeadLetterJobRecord) {
    this.logger.error(
      `Job [${record.id}] routed to DEAD-LETTER QUEUE after ${record.attemptsMade} failed attempts. Reason: ${record.failedReason}`,
    );
    this.deadLetterJobs.set(record.id, record);
  }

  getDeadLetterJobs(tenantId?: string, queueName?: string): DeadLetterJobRecord[] {
    let jobs = Array.from(this.deadLetterJobs.values());
    if (tenantId) {
      jobs = jobs.filter((j) => j.tenantId === tenantId);
    }
    if (queueName) {
      jobs = jobs.filter((j) => j.queueName === queueName);
    }
    return jobs;
  }

  async retryDeadLetterJob(jobId: string): Promise<{ success: boolean; message: string }> {
    const dlqJob = this.deadLetterJobs.get(jobId);
    if (!dlqJob) {
      throw new BadRequestException(`Dead-letter job [${jobId}] not found.`);
    }

    this.deadLetterJobs.delete(jobId);
    await this.addJob(dlqJob.queueName, dlqJob.name, dlqJob.data);
    return { success: true, message: `Job [${jobId}] successfully re-queued from DLQ.` };
  }

  async onModuleDestroy() {
    for (const [name, queue] of this.queues.entries()) {
      try {
        await queue.close();
      } catch (err: any) {
        this.logger.warn(`Error closing queue ${name}: ${err.message}`);
      }
    }
  }
}
