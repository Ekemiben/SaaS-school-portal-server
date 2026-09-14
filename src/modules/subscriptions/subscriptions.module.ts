import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { PlatformSubscriptionsController } from './platform-subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { UsageMeteringService } from './usage-metering.service.js';
import { TenantLifecycleService } from './tenant-lifecycle.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionsController, PlatformSubscriptionsController],
  providers: [
    SubscriptionsService,
    UsageMeteringService,
    TenantLifecycleService,
  ],
  exports: [
    SubscriptionsService,
    UsageMeteringService,
    TenantLifecycleService,
  ],
})
export class SubscriptionsModule {}
