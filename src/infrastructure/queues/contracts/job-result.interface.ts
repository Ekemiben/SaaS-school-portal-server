export interface JobResult<T = any> {
  success: boolean;
  jobId: string;
  queueName: string;
  tenantId: string;
  result?: T;
  error?: string;
  executionDurationMs?: number;
  completedAt: string;
}

export type JobStatusState =
  | 'created'
  | 'retry'
  | 'active'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'failed';

export interface JobStatusInfo {
  id: string;
  name: string;
  queue: string;
  state: JobStatusState;
  data: any;
  output?: any;
  retryCount: number;
  retryLimit: number;
  createdOn: Date;
  startedOn?: Date;
  completedOn?: Date;
  failedReason?: string;
}
