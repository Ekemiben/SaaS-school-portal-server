export interface JobEnvelope<T = any> {
  id: string;
  name: string;
  queueName: string;
  data: T;
  tenantId: string;
  userId?: string;
  correlationId?: string;
  traceId?: string;
  timestamp: string;
  metadata?: Record<string, any>;
  retryCount?: number;
  maxRetries?: number;
}

export interface EnqueueOptions {
  priority?: number;
  delay?: number; // seconds or milliseconds
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  expireInSeconds?: number;
  singletonKey?: string;
  deadLetter?: string;
  jobId?: string;
}
