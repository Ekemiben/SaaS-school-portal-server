import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../../database/prisma.module.js';
import { PgBossModule } from '../pg-boss/pg-boss.module.js';
import { TenantWorkerContext } from './tenant-worker.context.js';
import { NotificationWorker } from './notification.worker.js';
import { ReportWorker } from './report.worker.js';
import { ImportExportWorker } from './import-export.worker.js';
import { PaymentReconcileWorker } from './payment-reconcile.worker.js';
import { NotificationProcessor } from '../../../jobs/processors/notification.processor.js';
import { ReportProcessor } from '../../../jobs/processors/report.processor.js';
import { ImportExportProcessor } from '../../../jobs/processors/import-export.processor.js';
import { PaymentReconcileProcessor } from '../../../jobs/processors/payment-reconcile.processor.js';
import { EmailAdapter } from '../../../modules/notifications/adapters/email.adapter.js';
import { SmsAdapter } from '../../../modules/notifications/adapters/sms.adapter.js';
import { WhatsAppAdapter } from '../../../modules/notifications/adapters/whatsapp.adapter.js';

@Global()
@Module({
  imports: [PrismaModule, PgBossModule],
  providers: [
    TenantWorkerContext,
    EmailAdapter,
    SmsAdapter,
    WhatsAppAdapter,
    NotificationProcessor,
    ReportProcessor,
    ImportExportProcessor,
    PaymentReconcileProcessor,
    NotificationWorker,
    ReportWorker,
    ImportExportWorker,
    PaymentReconcileWorker,
  ],
  exports: [
    TenantWorkerContext,
    NotificationProcessor,
    ReportProcessor,
    ImportExportProcessor,
    PaymentReconcileProcessor,
    NotificationWorker,
    ReportWorker,
    ImportExportWorker,
    PaymentReconcileWorker,
  ],
})
export class WorkersModule {}
