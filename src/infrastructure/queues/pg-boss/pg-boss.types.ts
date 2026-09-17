/**
 * Canonical pg-boss queue type definitions per Constitution Section 114
 */

export interface PgBossJobData<T = any> {
  id: string;
  name: string;
  queueName: string;
  data: T;
  tenantId: string;
  campusId?: string;
  userId?: string;
  timestamp: string;
}

export interface PgBossQueueStats {
  queue: string;
  depth: number;
  active: number;
  completed: number;
  failed: number;
  deadLetter: number;
  oldestJobAgeSeconds?: number;
}

export interface QueueSystemHealth {
  status: 'healthy' | 'degraded' | 'offline';
  backend: 'pg-boss (PostgreSQL)' | 'pg-boss (in-memory-fallback)';
  isStarted: boolean;
  totalQueues: number;
  totalDeadLetterJobs: number;
  timestamp: string;
}
