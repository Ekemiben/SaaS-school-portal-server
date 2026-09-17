import { Injectable, Logger } from '@nestjs/common';
import { PgBossService } from '../pg-boss/pg-boss.service.js';
import { PgBossQueueStats, QueueSystemHealth } from '../pg-boss/pg-boss.types.js';
import { QUEUES } from '../../../jobs/queue.constants.js';

@Injectable()
export class QueueMetricsService {
  private readonly logger = new Logger(QueueMetricsService.name);

  constructor(private readonly pgBossService: PgBossService) {}

  /**
   * Returns high-level queue system health and operational mode.
   */
  async getSystemHealth(): Promise<QueueSystemHealth> {
    const isStarted = this.pgBossService.isStarted;
    const allQueues = Object.values(QUEUES);

    return {
      status: isStarted ? 'healthy' : 'degraded',
      backend: isStarted ? 'pg-boss (PostgreSQL)' : 'pg-boss (in-memory-fallback)',
      isStarted,
      totalQueues: allQueues.length,
      totalDeadLetterJobs: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Returns runtime metrics for a specific pg-boss queue.
   */
  async getQueueStats(queueName: string): Promise<PgBossQueueStats> {
    const boss = this.pgBossService.getBossInstance();

    if (this.pgBossService.isStarted && boss && typeof (boss as any).getQueue === 'function') {
      try {
        const queueData = await (boss as any).getQueue(queueName);
        return {
          queue: queueName,
          depth: queueData?.queued || 0,
          active: queueData?.active || 0,
          completed: queueData?.completed || 0,
          failed: queueData?.failed || 0,
          deadLetter: queueData?.deadletter || 0,
        };
      } catch (err: any) {
        this.logger.warn(`Could not fetch stats for queue ${queueName}: ${err.message}`);
      }
    }

    // Return in-memory fallback stats
    return {
      queue: queueName,
      depth: 0,
      active: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
    };
  }

  /**
   * Returns aggregated metrics across all active system queues.
   */
  async getAllQueueStats(): Promise<PgBossQueueStats[]> {
    const queues = Object.values(QUEUES);
    const stats: PgBossQueueStats[] = [];

    for (const q of queues) {
      stats.push(await this.getQueueStats(q));
    }

    return stats;
  }
}
