import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { OutboxService } from './outbox.service.js';
import type { IJobDispatcher } from '../queues/contracts/job-dispatcher.interface.js';
import { JOB_DISPATCHER } from '../queues/contracts/job-dispatcher.interface.js';
import { QUEUES } from '../../jobs/queue.constants.js';

@Injectable()
export class OutboxProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessor.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly workerId = `outbox-relay-${process.pid}-${Math.random().toString(36).substring(2, 6)}`;

  constructor(
    private readonly outboxService: OutboxService,
    @Inject(JOB_DISPATCHER) private readonly dispatcher: IJobDispatcher,
  ) {}

  onModuleInit() {
    this.startPolling();
  }

  startPolling(intervalMs = 3000) {
    this.timer = setInterval(() => {
      this.processPendingEvents().catch((err) => {
        this.logger.error(`Outbox polling error: ${err.message}`);
      });
    }, intervalMs);
    this.logger.log(`Outbox relay processor started (poll interval: ${intervalMs}ms)`);
  }

  private resolveQueue(eventType: string): string {
    const type = eventType.toLowerCase();
    if (type.includes('notification') || type.includes('email') || type.includes('sms') || type.includes('whatsapp')) {
      return QUEUES.NOTIFICATIONS;
    }
    if (type.includes('report')) {
      return QUEUES.REPORTS;
    }
    if (type.includes('import') || type.includes('export')) {
      return QUEUES.IMPORT_EXPORT;
    }
    if (type.includes('payment') || type.includes('reconcile')) {
      return QUEUES.PAYMENT_RECONCILE;
    }
    return QUEUES.NOTIFICATIONS;
  }

  async processPendingEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const events = await this.outboxService.fetchPendingBatch(50);
      if (!events || events.length === 0) {
        return;
      }

      this.logger.debug(`Relaying ${events.length} outbox events to pg-boss queues...`);

      for (const event of events) {
        const claimed = await this.outboxService.claimEvent(event.id, this.workerId);
        if (!claimed) continue;

        try {
          const queueName = this.resolveQueue(event.eventType);
          await this.dispatcher.dispatch(
            queueName,
            event.eventType,
            event.payload,
            event.tenantId,
          );
          await this.outboxService.markPublished(event.id);
        } catch (err: any) {
          this.logger.error(`Failed to publish outbox event ${event.id}: ${err.message}`);
          await this.outboxService.markFailed(event.id, err.message);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
