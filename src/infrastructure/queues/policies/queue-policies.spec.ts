import { describe, it, expect } from 'vitest';
import { getRetryPolicyForQueue } from './retry.policy.js';
import { getConcurrencyPolicyForQueue } from './concurrency.policy.js';
import { getRetentionPolicyForQueue } from './retention.policy.js';
import { QueueMetricsService } from '../monitoring/queue-metrics.service.js';
import { PgBossService } from '../pg-boss/pg-boss.service.js';
import { ConfigService } from '@nestjs/config';

describe('Canonical Queue Policies & Metrics (Constitution Section 98 & 114)', () => {
  it('should return defined retry policies per queue type', () => {
    const notifyPolicy = getRetryPolicyForQueue('notifications-queue');
    expect(notifyPolicy.maxRetries).toBe(5);
    expect(notifyPolicy.retryBackoff).toBe(true);
    expect(notifyPolicy.deadLetterQueue).toBe('dead-letter-notifications');

    const reportPolicy = getRetryPolicyForQueue('reports-queue');
    expect(reportPolicy.maxRetries).toBe(3);
    expect(reportPolicy.expireInSeconds).toBe(1800);
  });

  it('should return defined concurrency policies per queue type', () => {
    const notifyConcurrency = getConcurrencyPolicyForQueue('notifications-queue');
    expect(notifyConcurrency.teamSize).toBe(10);

    const reportConcurrency = getConcurrencyPolicyForQueue('reports-queue');
    expect(reportConcurrency.teamSize).toBe(2);
  });

  it('should return defined retention policies per queue type', () => {
    const paymentRetention = getRetentionPolicyForQueue('payment-reconcile-queue');
    expect(paymentRetention.completedJobRetentionDays).toBe(7);
    expect(paymentRetention.failedJobRetentionDays).toBe(30);
  });

  it('should report queue system health via QueueMetricsService', async () => {
    const configService = new ConfigService({});
    const pgBossService = new PgBossService(configService);
    const metricsService = new QueueMetricsService(pgBossService);

    const health = await metricsService.getSystemHealth();
    expect(health).toBeDefined();
    expect(health.totalQueues).toBeGreaterThan(0);
    expect(health.backend).toContain('pg-boss');

    const stats = await metricsService.getAllQueueStats();
    expect(Array.isArray(stats)).toBe(true);
    expect(stats.length).toBeGreaterThan(0);
  });
});
