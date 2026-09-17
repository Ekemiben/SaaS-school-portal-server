/**
 * Canonical Retry Policy per Constitution Section 63 & 114
 * Defines backoff, retry limits, and dead-letter routing for pg-boss queues.
 */

export interface QueueRetryOptions {
  maxRetries: number;
  retryDelaySeconds: number;
  retryBackoff: boolean;
  expireInSeconds: number;
  deadLetterQueue?: string;
}

export const QUEUE_RETRY_POLICIES: Record<string, QueueRetryOptions> = {
  'notifications-queue': {
    maxRetries: 5,
    retryDelaySeconds: 3,
    retryBackoff: true,
    expireInSeconds: 300,
    deadLetterQueue: 'dead-letter-notifications',
  },
  'reports-queue': {
    maxRetries: 3,
    retryDelaySeconds: 10,
    retryBackoff: true,
    expireInSeconds: 1800,
    deadLetterQueue: 'dead-letter-reports',
  },
  'payment-reconcile-queue': {
    maxRetries: 5,
    retryDelaySeconds: 5,
    retryBackoff: true,
    expireInSeconds: 600,
    deadLetterQueue: 'dead-letter-payments',
  },
  'import-export-queue': {
    maxRetries: 2,
    retryDelaySeconds: 15,
    retryBackoff: false,
    expireInSeconds: 3600,
    deadLetterQueue: 'dead-letter-import-export',
  },
};

export function getRetryPolicyForQueue(queueName: string): QueueRetryOptions {
  return (
    QUEUE_RETRY_POLICIES[queueName] || {
      maxRetries: 3,
      retryDelaySeconds: 2,
      retryBackoff: true,
      expireInSeconds: 600,
      deadLetterQueue: 'dead-letter-default',
    }
  );
}
