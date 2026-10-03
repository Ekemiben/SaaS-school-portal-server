import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PgBossService } from '../pg-boss/pg-boss.service.js';
import { TenantWorkerContext } from './tenant-worker.context.js';
import { NotificationProcessor } from '../../../jobs/processors/notification.processor.js';
import { QUEUES } from '../../../jobs/queue.constants.js';
import { JobEnvelope } from '../contracts/job-envelope.interface.js';

@Injectable()
export class NotificationWorker implements OnModuleInit {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly workerContext: TenantWorkerContext,
    private readonly processor: NotificationProcessor,
  ) {}

  async onModuleInit() {
    await this.register();
  }

  async register() {
    await this.pgBossService.work(
      QUEUES.NOTIFICATIONS,
      async (job: { id: string; name: string; data: JobEnvelope }) => {
        return this.workerContext.runWithTenantContext(job.data, async (payload) => {
          const envelope = job.data;
          const actualData = {
            ...(payload?.data || payload || {}),
            tenantId: payload?.tenantId || envelope?.tenantId,
            channel: payload?.channel || (envelope?.name === 'send-sms' ? 'sms' : envelope?.name === 'send-whatsapp' ? 'whatsapp' : 'email'),
          };
          return this.processor.process({ id: job.id, data: actualData });
        });
      },
      { teamSize: 5, teamConcurrency: 2 },
    );
    this.logger.log(`NotificationWorker registered for queue "${QUEUES.NOTIFICATIONS}"`);
  }
}
