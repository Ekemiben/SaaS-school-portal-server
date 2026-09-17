import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PgBossService } from '../pg-boss/pg-boss.service.js';
import { TenantWorkerContext } from './tenant-worker.context.js';
import { ImportExportProcessor } from '../../../jobs/processors/import-export.processor.js';
import { QUEUES } from '../../../jobs/queue.constants.js';
import { JobEnvelope } from '../contracts/job-envelope.interface.js';

@Injectable()
export class ImportExportWorker implements OnModuleInit {
  private readonly logger = new Logger(ImportExportWorker.name);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly workerContext: TenantWorkerContext,
    private readonly processor: ImportExportProcessor,
  ) {}

  async onModuleInit() {
    await this.register();
  }

  async register() {
    await this.pgBossService.work(
      QUEUES.IMPORT_EXPORT,
      async (job: { id: string; name: string; data: JobEnvelope }) => {
        return this.workerContext.runWithTenantContext(job.data, async (payload) => {
          const actualData = payload?.data || payload;
          return this.processor.process({ id: job.id, data: actualData });
        });
      },
      { teamSize: 2, teamConcurrency: 1 },
    );
    this.logger.log(`ImportExportWorker registered for queue "${QUEUES.IMPORT_EXPORT}"`);
  }
}
