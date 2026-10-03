import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { QueueService } from './queue.service.js';
import { QUEUES } from './queue.constants.js';
import { NotificationProcessor } from './processors/notification.processor.js';
import { ReportProcessor } from './processors/report.processor.js';
import { ImportExportProcessor } from './processors/import-export.processor.js';
import { PaymentReconcileProcessor } from './processors/payment-reconcile.processor.js';

@Injectable()
export class QueueWorkersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueWorkersService.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly notificationProcessor: NotificationProcessor,
    private readonly reportProcessor: ReportProcessor,
    private readonly importExportProcessor: ImportExportProcessor,
    private readonly paymentReconcileProcessor: PaymentReconcileProcessor,
  ) {}

  async onModuleInit() {
    this.logger.log('QueueWorkersService: background job processing delegating to pg-boss workers with tenant context.');
  }

  /**
   * Executes a job through its registered processor directly (used in fallback/testing mode)
   */
  async executeJob(queueName: string, jobData: { id: string; name: string; data: any }): Promise<any> {
    const { id, name, data } = jobData;
    const envelope = data && data.tenantId ? data : null;
    const actualData = envelope
      ? {
          ...(envelope.data || {}),
          tenantId: envelope.tenantId,
          reportType: envelope.data?.reportType || envelope.name || name || 'report',
          channel:
            envelope.data?.channel ||
            (envelope.name === 'send-sms'
              ? 'sms'
              : envelope.name === 'send-whatsapp'
              ? 'whatsapp'
              : 'email'),
        }
      : data;

    switch (queueName) {
      case QUEUES.NOTIFICATIONS:
        return await this.notificationProcessor.process({ id, data: actualData });
      case QUEUES.REPORTS:
        return await this.reportProcessor.process({ id, data: actualData });
      case QUEUES.IMPORT_EXPORT:
        return await this.importExportProcessor.process({ id, data: actualData });
      case QUEUES.PAYMENT_RECONCILE:
        return await this.paymentReconcileProcessor.process({ id, data: actualData });
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }

  async onModuleDestroy() {
    this.logger.log('QueueWorkersService stopped.');
  }
}
