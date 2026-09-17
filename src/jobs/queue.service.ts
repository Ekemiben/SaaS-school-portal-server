import { Injectable, Logger, BadRequestException, Inject, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { QUEUES } from './queue.constants.js';
import {
  BaseJobPayload,
  EnqueueJobOptions,
  JobStatusResponse,
  DeadLetterJobRecord,
  JobState,
} from './job.interface.js';
import { IJobDispatcher, JOB_DISPATCHER } from '../infrastructure/queues/contracts/job-dispatcher.interface.js';
import { PgBossService } from '../infrastructure/queues/pg-boss/pg-boss.service.js';
import { PgBossDispatcher } from '../infrastructure/queues/pg-boss/pg-boss.dispatcher.js';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  public deadLetterJobs: Map<string, DeadLetterJobRecord> = new Map();
  public dispatcher: IJobDispatcher;
  public pgBossService: PgBossService;

  constructor(
    @Optional() @Inject(JOB_DISPATCHER) dispatcherOrFirstArg?: any,
    @Optional() pgBossServiceOrSecondArg?: any,
  ) {
    if (dispatcherOrFirstArg && typeof dispatcherOrFirstArg.dispatch === 'function') {
      this.dispatcher = dispatcherOrFirstArg;
    }
    if (pgBossServiceOrSecondArg && typeof pgBossServiceOrSecondArg.start === 'function') {
      this.pgBossService = pgBossServiceOrSecondArg;
    }
    if (!this.pgBossService) {
      const mockConfig = { get: () => undefined } as any;
      this.pgBossService = new PgBossService(mockConfig);
    }
    if (!this.dispatcher) {
      this.dispatcher = new PgBossDispatcher(this.pgBossService);
    }
  }

  async onModuleInit() {
    if (!this.pgBossService.isStarted) {
      await this.pgBossService.start();
    }
  }

  async onModuleDestroy() {
    await this.pgBossService.onModuleDestroy();
  }

  async addJob<T extends BaseJobPayload>(
    queueName: string,
    jobName: string,
    data: T,
    options?: EnqueueJobOptions,
  ): Promise<{ jobId: string; queueName: string; status: string }> {
    if (!data || !data.tenantId || typeof data.tenantId !== 'string' || !data.tenantId.trim()) {
      throw new BadRequestException('Security violation: Tenant context (tenantId) is required for all queue jobs.');
    }

    const tenantId = data.tenantId.trim();
    const jobId = await this.dispatcher.dispatch(
      queueName,
      jobName,
      data,
      tenantId,
      {
        retryLimit: options?.attempts ?? 3,
        retryDelay: options?.backoffDelay ? Math.max(1, Math.round(options.backoffDelay / 1000)) : 2,
        priority: options?.priority,
        delay: options?.delay ? Math.max(1, Math.round(options.delay / 1000)) : undefined,
        jobId: options?.jobId,
      },
    );

    this.logger.log(`Enqueued pg-boss job [${jobId}] on [${queueName}] for tenant ${tenantId}`);
    return { jobId, queueName, status: 'ENQUEUED' };
  }

  async dispatch<T = any>(
    queueName: string,
    jobName: string,
    payload: { tenantId?: string; [key: string]: any },
    customOptions?: Record<string, any>,
  ): Promise<{ jobId: string; queue: string }> {
    if (!payload || !payload.tenantId || typeof payload.tenantId !== 'string' || !payload.tenantId.trim()) {
      throw new BadRequestException('Tenant context required: Tenant context (tenantId) is required for all queue jobs.');
    }

    const tenantId = payload.tenantId.trim();
    const jobId = await this.dispatcher.dispatch(
      queueName,
      jobName,
      payload,
      tenantId,
      {
        retryLimit: customOptions?.attempts ?? 3,
        retryDelay: customOptions?.backoff?.delay ? Math.max(1, Math.round(customOptions.backoff.delay / 1000)) : 2,
        priority: customOptions?.priority,
        delay: customOptions?.delay ? Math.max(1, Math.round(customOptions.delay / 1000)) : undefined,
      },
    );

    this.logger.log(`Dispatched pg-boss job [${jobName}] #${jobId} to queue "${queueName}" for tenant "${tenantId}"`);
    return { jobId, queue: queueName };
  }

  async getJobStatus(queueName: string, jobId: string): Promise<JobStatusResponse | null> {
    const info = await this.dispatcher.getJobStatus(queueName, jobId);
    if (!info) return null;

    return {
      id: info.id,
      name: info.name,
      queueName: info.queue || queueName,
      tenantId: info.data?.tenantId || (info.data?.data && info.data.data.tenantId) || 'unknown',
      state: (info.state === 'created' ? 'waiting' : info.state) as JobState,
      attemptsMade: info.retryCount,
      maxAttempts: info.retryLimit,
      failedReason: info.failedReason,
      timestamp: info.createdOn ? new Date(info.createdOn).getTime() : Date.now(),
      finishedOn: info.completedOn ? new Date(info.completedOn).getTime() : undefined,
      data: info.data?.data || info.data,
      returnvalue: info.output,
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
    return { success: true, message: `Job [${jobId}] successfully re-queued from DLQ via pg-boss.` };
  }
}
