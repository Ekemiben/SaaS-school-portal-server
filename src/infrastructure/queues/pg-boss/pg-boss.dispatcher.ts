import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { IJobDispatcher } from '../contracts/job-dispatcher.interface.js';
import { EnqueueOptions, JobEnvelope } from '../contracts/job-envelope.interface.js';
import { JobStatusInfo } from '../contracts/job-result.interface.js';
import { PgBossService } from './pg-boss.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class PgBossDispatcher implements IJobDispatcher {
  private readonly logger = new Logger(PgBossDispatcher.name);

  constructor(private readonly pgBossService: PgBossService) {}

  private validateTenant(tenantId: string): void {
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new BadRequestException('Security violation: Multi-tenant job dispatch requires a valid tenantId.');
    }
  }

  private buildEnvelope<T>(
    queueName: string,
    jobName: string,
    data: T,
    tenantId: string,
    options?: EnqueueOptions,
  ): JobEnvelope<T> {
    this.validateTenant(tenantId);

    return {
      id: options?.jobId || randomUUID(),
      name: jobName,
      queueName,
      data,
      tenantId: tenantId.trim(),
      timestamp: new Date().toISOString(),
      retryCount: 0,
      maxRetries: options?.retryLimit ?? 3,
    };
  }

  async dispatch<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    tenantId: string,
    options?: EnqueueOptions,
  ): Promise<string> {
    const envelope = this.buildEnvelope(queueName, jobName, data, tenantId, options);

    const sendOptions: Record<string, any> = {
      retryLimit: options?.retryLimit ?? 3,
      retryDelay: options?.retryDelay ?? 2,
      retryBackoff: options?.retryBackoff ?? true,
      priority: options?.priority,
    };

    if (options?.delay && options.delay > 0) {
      sendOptions.startAfter = options.delay;
    }
    if (options?.singletonKey) {
      sendOptions.singletonKey = options.singletonKey;
    }
    if (options?.expireInSeconds) {
      sendOptions.expireInSeconds = options.expireInSeconds;
    }
    if (options?.deadLetter) {
      sendOptions.deadLetter = options.deadLetter;
    }

    const jobId = await this.pgBossService.send(queueName, envelope, sendOptions);
    this.logger.log(`Dispatched job [${jobName}] #${jobId} to queue "${queueName}" for tenant "${tenantId}"`);
    return jobId;
  }

  async dispatchBatch<T = any>(
    jobs: Array<{
      queueName: string;
      jobName: string;
      data: T;
      tenantId: string;
      options?: EnqueueOptions;
    }>,
  ): Promise<string[]> {
    const results: string[] = [];
    for (const j of jobs) {
      const id = await this.dispatch(j.queueName, j.jobName, j.data, j.tenantId, j.options);
      results.push(id);
    }
    return results;
  }

  async schedule<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    tenantId: string,
    delaySeconds: number,
    options?: EnqueueOptions,
  ): Promise<string> {
    return this.dispatch(queueName, jobName, data, tenantId, {
      ...options,
      delay: delaySeconds,
    });
  }

  async getJobStatus(queueName: string, jobId: string): Promise<JobStatusInfo | null> {
    return this.pgBossService.getJobStatus(queueName, jobId);
  }

  async cancel(queueName: string, jobId: string): Promise<boolean> {
    return this.pgBossService.cancel(queueName, jobId);
  }
}
