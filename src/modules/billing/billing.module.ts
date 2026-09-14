import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';

@Module({
  imports: [PrismaModule, SubscriptionsModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
