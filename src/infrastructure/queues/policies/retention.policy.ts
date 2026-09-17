/**
 * Canonical Retention Policy per Constitution Section 81 & 114
 * Defines retention periods for completed, failed, and archived jobs in PostgreSQL/pg-boss.
 */

export interface QueueRetentionOptions {
  completedJobRetentionDays: number;
  failedJobRetentionDays: number;
  deadLetterJobRetentionDays: number;
  archiveIntervalHours: number;
}

export const QUEUE_RETENTION_POLICIES: Record<string, QueueRetentionOptions> = {
  'notifications-queue': {
    completedJobRetentionDays: 1,
    failedJobRetentionDays: 7,
    deadLetterJobRetentionDays: 30,
    archiveIntervalHours: 12,
  },
  'reports-queue': {
    completedJobRetentionDays: 3,
    failedJobRetentionDays: 14,
    deadLetterJobRetentionDays: 30,
    archiveIntervalHours: 24,
  },
  'payment-reconcile-queue': {
    completedJobRetentionDays: 7,
    failedJobRetentionDays: 30,
    deadLetterJobRetentionDays: 90,
    archiveIntervalHours: 6,
  },
  'import-export-queue': {
    completedJobRetentionDays: 2,
    failedJobRetentionDays: 14,
    deadLetterJobRetentionDays: 30,
    archiveIntervalHours: 24,
  },
};

export function getRetentionPolicyForQueue(queueName: string): QueueRetentionOptions {
  return (
    QUEUE_RETENTION_POLICIES[queueName] || {
      completedJobRetentionDays: 1,
      failedJobRetentionDays: 7,
      deadLetterJobRetentionDays: 30,
      archiveIntervalHours: 24,
    }
  );
}
