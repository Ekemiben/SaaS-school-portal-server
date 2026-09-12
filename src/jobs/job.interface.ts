export interface BaseJobPayload {
  tenantId: string;
  requestedByUserId?: string;
  createdAt?: string;
  [key: string]: any;
}

export type JobState =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused'
  | 'prioritized'
  | 'unknown';

export interface JobStatusResponse {
  id: string;
  name: string;
  queueName: string;
  tenantId: string;
  state: JobState;
  progress?: number | object;
  attemptsMade: number;
  maxAttempts: number;
  failedReason?: string;
  stacktrace?: string[];
  timestamp?: number;
  finishedOn?: number;
  data: BaseJobPayload;
  returnvalue?: any;
}

export interface EnqueueJobOptions {
  attempts?: number;
  backoffDelay?: number;
  priority?: number;
  delay?: number;
  jobId?: string;
}

export interface DeadLetterJobRecord {
  id: string;
  queueName: string;
  name: string;
  tenantId: string;
  data: BaseJobPayload;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
  stacktrace?: string[];
}
