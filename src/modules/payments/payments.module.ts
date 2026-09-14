import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PaystackPaymentAdapter } from './adapters/paystack.adapter.js';
import { FlutterwavePaymentAdapter } from './adapters/flutterwave.adapter.js';
import { FilesModule } from '../files/files.module.js';
import { QueuesModule } from '../../jobs/queues.module.js';

import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule, FilesModule, QueuesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaystackPaymentAdapter, FlutterwavePaymentAdapter],
  exports: [PaymentsService, PaystackPaymentAdapter, FlutterwavePaymentAdapter],
})
export class PaymentsModule {}
