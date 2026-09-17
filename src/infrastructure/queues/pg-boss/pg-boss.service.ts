import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import { createPgBossConfig } from './pg-boss.config.js';
import { JobEnvelope } from '../contracts/job-envelope.interface.js';

interface MemoryJobRecord {
  id: string;
  name: string;
  data: any;
  state: string;
  options: any;
  createdOn: Date;
  output?: any;
  failedReason?: string;
}

@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossService.name);
  private boss: PgBoss | null = null;
  public isStarted = false;

  // Resilient fallback storage for test environments / disconnected local DBs
  private memoryJobs = new Map<string, MemoryJobRecord>();
  private memoryWorkers = new Map<string, Array<(job: any) => Promise<any>>>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.start();
  }

  async start(): Promise<void> {
    const config = createPgBossConfig(this.configService);
    if (!config.connectionString) {
      if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_DB === 'true') {
        this.logger.error('Critical: No DATABASE_URL configured for pg-boss in production.');
        throw new Error('Production queue connection failure: Missing database connection string for pg-boss.');
      }
      this.logger.warn('No DATABASE_URL configured for pg-boss. Running in local in-memory fallback mode.');
      this.isStarted = false;
      return;
    }

    try {
      this.boss = new PgBoss(config);
      this.boss.on('error', (err: any) => {
        this.logger.error(`pg-boss background engine error: ${err.message}`, err.stack);
      });

      await this.boss.start();
      this.isStarted = true;
      this.logger.log(`pg-boss engine started successfully on PostgreSQL schema: ${config.schema || 'pgboss'}`);
    } catch (error: any) {
      this.isStarted = false;
      if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_DB === 'true') {
        throw new Error(`Production queue connection failure: ${error?.message}`);
      }
      this.logger.warn(`Failed to connect pg-boss to PostgreSQL (${error?.message}). Background queues running in local memory fallback mode.`);
    }
  }

  getBoss(): PgBoss | null {
    return this.boss;
  }

  async send<T = any>(
    name: string,
    data: JobEnvelope<T>,
    options?: any,
  ): Promise<string> {
    if (this.isStarted && this.boss) {
      const jobId = await this.boss.send(name, data as any, options);
      if (jobId) {
        return jobId;
      }
      return `job_${Date.now()}`;
    }

    // In-memory fallback
    const mockId = `job_mem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const storedJob: MemoryJobRecord = {
      id: mockId,
      name,
      data,
      state: 'created',
      options,
      createdOn: new Date(),
    };
    this.memoryJobs.set(mockId, storedJob);

    // If workers are registered in-memory, trigger async execution
    const handlers = this.memoryWorkers.get(name) || [];
    for (const handler of handlers) {
      setImmediate(async () => {
        try {
          storedJob.state = 'active';
          const res = await handler({ id: mockId, name, data });
          storedJob.state = 'completed';
          storedJob.output = res;
        } catch (err: any) {
          storedJob.state = 'failed';
          storedJob.failedReason = err.message;
        }
      });
    }

    return mockId;
  }

  async work<T = any>(
    queueName: string,
    handler: (job: { id: string; name: string; data: JobEnvelope<T> }) => Promise<any>,
    options?: any,
  ): Promise<void> {
    if (this.isStarted && this.boss) {
      await this.boss.work(queueName, options || {}, async (jobs: any) => {
        const jobList = Array.isArray(jobs) ? jobs : [jobs];
        for (const job of jobList) {
          await handler({
            id: job.id,
            name: job.name,
            data: job.data as JobEnvelope<T>,
          });
        }
      });
      this.logger.log(`Worker registered on pg-boss queue: "${queueName}"`);
      return;
    }

    // Fallback registration
    const existing = this.memoryWorkers.get(queueName) || [];
    existing.push(handler);
    this.memoryWorkers.set(queueName, existing);
    this.logger.log(`Fallback worker registered on queue: "${queueName}"`);
  }

  async getJobStatus(queueName: string, jobId: string): Promise<any | null> {
    if (this.isStarted && this.boss) {
      const job = await this.boss.getJobById(queueName, jobId);
      if (!job) return null;
      return {
        id: job.id,
        name: job.name,
        queue: queueName,
        state: job.state,
        data: job.data,
        output: job.output,
        retryCount: job.retryCount || 0,
        retryLimit: job.retryLimit || 3,
        createdOn: job.createdOn,
        startedOn: job.startedOn,
        completedOn: job.completedOn,
        failedReason: (job as any).output?.message || undefined,
      };
    }

    const memJob = this.memoryJobs.get(jobId);
    if (!memJob) return null;

    return {
      id: memJob.id,
      name: memJob.name,
      queue: queueName,
      state: memJob.state,
      data: memJob.data,
      output: memJob.output,
      retryCount: 0,
      retryLimit: memJob.options?.retryLimit ?? 3,
      createdOn: memJob.createdOn,
      failedReason: memJob.failedReason,
    };
  }

  async cancel(queueName: string, jobId: string): Promise<boolean> {
    if (this.isStarted && this.boss) {
      await this.boss.cancel(queueName, jobId);
      return true;
    }

    const memJob = this.memoryJobs.get(jobId);
    if (memJob) {
      memJob.state = 'cancelled';
      return true;
    }
    return false;
  }

  getBossInstance(): PgBoss | null {
    return this.boss;
  }

  async onModuleDestroy() {
    if (this.boss && this.isStarted) {
      try {
        await this.boss.stop({ graceful: true, timeout: 5000 });
        this.logger.log('pg-boss engine stopped gracefully.');
      } catch (err: any) {
        this.logger.warn(`Error stopping pg-boss: ${err?.message}`);
      }
    }
  }
}
