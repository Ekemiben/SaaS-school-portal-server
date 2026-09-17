import { Global, Module } from '@nestjs/common';
import { JobsController } from './jobs.controller.js';
import { QueueService } from './queue.service.js';
import { QueueWorkersService } from './queue-workers.service.js';
import { BullmqService } from './bullmq.service.js';
import { NotificationProcessor } from './processors/notification.processor.js';
import { ReportProcessor } from './processors/report.processor.js';
import { ImportExportProcessor } from './processors/import-export.processor.js';
import { PaymentReconcileProcessor } from './processors/payment-reconcile.processor.js';
import { EmailAdapter } from '../modules/notifications/adapters/email.adapter.js';
import { SmsAdapter } from '../modules/notifications/adapters/sms.adapter.js';
import { WhatsAppAdapter } from '../modules/notifications/adapters/whatsapp.adapter.js';
import { PgBossModule } from '../infrastructure/queues/pg-boss/pg-boss.module.js';

@Global()
@Module({
  imports: [PgBossModule],
  controllers: [JobsController],
  providers: [
    QueueService,
    QueueWorkersService,
    EmailAdapter,
    SmsAdapter,
    WhatsAppAdapter,
    NotificationProcessor,
    ReportProcessor,
    ImportExportProcessor,
    PaymentReconcileProcessor,
    BullmqService,
  ],
  exports: [
    QueueService,
    QueueWorkersService,
    EmailAdapter,
    SmsAdapter,
    WhatsAppAdapter,
    NotificationProcessor,
    ReportProcessor,
    ImportExportProcessor,
    PaymentReconcileProcessor,
    BullmqService,
  ],
})
export class QueuesModule {}
