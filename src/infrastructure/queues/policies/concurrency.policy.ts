/**
 * Canonical Concurrency Policy per Constitution Section 63 & 114
 * Defines worker concurrency limits and batch processing sizes per queue.
 */

export interface QueueConcurrencyOptions {
  teamSize: number;
  batchSize: number;
  newJobCheckIntervalSeconds: number;
}

export const QUEUE_CONCURRENCY_POLICIES: Record<string, QueueConcurrencyOptions> = {
  'notifications-queue': {
    teamSize: 10,
    batchSize: 20,
    newJobCheckIntervalSeconds: 1,
  },
  'reports-queue': {
    teamSize: 2,
    batchSize: 2,
    newJobCheckIntervalSeconds: 5,
  },
  'payment-reconcile-queue': {
    teamSize: 5,
    batchSize: 5,
    newJobCheckIntervalSeconds: 2,
  },
  'import-export-queue': {
    teamSize: 2,
    batchSize: 1,
    newJobCheckIntervalSeconds: 5,
  },
};

export function getConcurrencyPolicyForQueue(queueName: string): QueueConcurrencyOptions {
  return (
    QUEUE_CONCURRENCY_POLICIES[queueName] || {
      teamSize: 5,
      batchSize: 5,
      newJobCheckIntervalSeconds: 2,
    }
  );
}
