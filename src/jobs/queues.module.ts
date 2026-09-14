import { Global, Module } from '@nestjs/common';
import { BullmqService } from './bullmq.service.js';
import { NotificationProcessor } from './processors/notification.processor.js';
import { ReportProcessor } from './processors/report.processor.js';
import { ImportExportProcessor } from './processors/import-export.processor.js';
import { PaymentReconcileProcessor } from './processors/payment-reconcile.processor.js';
import { EmailAdapter } from '../modules/notifications/adapters/email.adapter.js';
import { SmsAdapter } from '../modules/notifications/adapters/sms.adapter.js';
import { WhatsAppAdapter } from '../modules/notifications/adapters/whatsapp.adapter.js';

@Global()
@Module({
  providers: [
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
