import { Module } from '@nestjs/common';
import { FeesController } from './fees.controller.js';
import { FeesService } from './fees.service.js';
import { BulkInvoicingService } from './services/bulk-invoicing.service.js';
import { DebtRecoveryService } from './services/debt-recovery.service.js';
import { PaymentPlanService } from './services/payment-plan.service.js';
import { FilesModule } from '../files/files.module.js';
import { QueuesModule } from '../../jobs/queues.module.js';

@Module({
  imports: [FilesModule, QueuesModule],
  controllers: [FeesController],
  providers: [
    FeesService,
    BulkInvoicingService,
    DebtRecoveryService,
    PaymentPlanService,
  ],
  exports: [
    FeesService,
    BulkInvoicingService,
    DebtRecoveryService,
    PaymentPlanService,
  ],
})
export class FeesModule {}
