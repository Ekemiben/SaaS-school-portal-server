export interface TenantJobPayload<T = any> {
  tenantId: string;
  userId?: string;
  requestId?: string;
  campusId?: string;
  createdAt?: string;
  data: T;
}

export type JobState = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';

export interface JobStatusResponse {
  id: string;
  name: string;
  queue: string;
  status: JobState;
  progress: number | object | string | boolean;
  result?: any;
  failedReason?: string;
  attemptsMade: number;
  maxAttempts: number;
  timestamp: number;
  tenantId?: string;
}

export interface DeadLetterPayload {
  originalJobId: string;
  originalQueue: string;
  jobName: string;
  tenantId: string;
  payload: any;
  failedReason: string;
  stacktrace?: string[] | null;
  failedAt: string;
  attemptsMade: number;
}
