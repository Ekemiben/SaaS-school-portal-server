import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PgBossService } from '../pg-boss/pg-boss.service.js';
import { TenantWorkerContext } from './tenant-worker.context.js';
import { PaymentReconcileProcessor } from '../../../jobs/processors/payment-reconcile.processor.js';
import { QUEUES } from '../../../jobs/queue.constants.js';
import { JobEnvelope } from '../contracts/job-envelope.interface.js';

@Injectable()
export class PaymentReconcileWorker implements OnModuleInit {
  private readonly logger = new Logger(PaymentReconcileWorker.name);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly workerContext: TenantWorkerContext,
    private readonly processor: PaymentReconcileProcessor,
  ) {}

  async onModuleInit() {
    await this.register();
  }

  async register() {
    await this.pgBossService.work(
      QUEUES.PAYMENT_RECONCILE,
      async (job: { id: string; name: string; data: JobEnvelope }) => {
        return this.workerContext.runWithTenantContext(job.data, async (payload) => {
          const actualData = payload?.data || payload;
          return this.processor.process({ id: job.id, data: actualData });
        });
      },
      { teamSize: 2, teamConcurrency: 1 },
    );
    this.logger.log(`PaymentReconcileWorker registered for queue "${QUEUES.PAYMENT_RECONCILE}"`);
  }
}
