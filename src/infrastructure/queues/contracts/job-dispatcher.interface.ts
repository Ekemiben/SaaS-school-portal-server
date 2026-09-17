import { EnqueueOptions, JobEnvelope } from './job-envelope.interface.js';
import { JobStatusInfo } from './job-result.interface.js';

export const JOB_DISPATCHER = Symbol('JOB_DISPATCHER');

export interface IJobDispatcher {
  /**
   * Dispatches a job to the specified queue with tenant context.
   */
  dispatch<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    tenantId: string,
    options?: EnqueueOptions,
  ): Promise<string>;

  /**
   * Dispatches multiple jobs in batch.
   */
  dispatchBatch<T = any>(
    jobs: Array<{
      queueName: string;
      jobName: string;
      data: T;
      tenantId: string;
      options?: EnqueueOptions;
    }>,
  ): Promise<string[]>;

  /**
   * Schedules a delayed job.
   */
  schedule<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    tenantId: string,
    delaySeconds: number,
    options?: EnqueueOptions,
  ): Promise<string>;

  /**
   * Retrieves the current status and metadata of a queued/executed job.
   */
  getJobStatus(queueName: string, jobId: string): Promise<JobStatusInfo | null>;

  /**
   * Cancels a pending job.
   */
  cancel(queueName: string, jobId: string): Promise<boolean>;
}
