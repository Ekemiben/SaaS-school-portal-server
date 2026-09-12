import { Global, Module } from '@nestjs/common';
import { RedisConnectionService } from './redis-connection.service.js';
import { QueueService } from './queue.service.js';
import { QueueWorkersService } from './queue-workers.service.js';
import { JobsController } from './jobs.controller.js';
import { NotificationProcessor } from './processors/notification.processor.js';
import { ReportProcessor } from './processors/report.processor.js';
import { ImportExportProcessor } from './processors/import-export.processor.js';
import { PaymentReconcileProcessor } from './processors/payment-reconcile.processor.js';
import { EmailAdapter } from '../modules/notifications/adapters/email.adapter.js';
import { SmsAdapter } from '../modules/notifications/adapters/sms.adapter.js';
import { WhatsAppAdapter } from '../modules/notifications/adapters/whatsapp.adapter.js';

@Global()
@Module({
  controllers: [JobsController],
  providers: [
    RedisConnectionService,
    QueueService,
    QueueWorkersService,
    EmailAdapter,
    SmsAdapter,
    WhatsAppAdapter,
    NotificationProcessor,
    ReportProcessor,
    ImportExportProcessor,
    PaymentReconcileProcessor,
  ],
  exports: [
    RedisConnectionService,
    QueueService,
    QueueWorkersService,
    EmailAdapter,
    SmsAdapter,
    WhatsAppAdapter,
    NotificationProcessor,
    ReportProcessor,
    ImportExportProcessor,
    PaymentReconcileProcessor,
  ],
})
export class QueuesModule {}
