import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { SubscriptionPaymentsService } from './subscription-payments.service.js';

@Module({
  imports: [PrismaModule, forwardRef(() => SubscriptionsModule), PaymentsModule],
  controllers: [BillingController],
  providers: [BillingService, SubscriptionPaymentsService],
  exports: [BillingService, SubscriptionPaymentsService],
})
export class BillingModule {}
