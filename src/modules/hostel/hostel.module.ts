import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { QueuesModule } from '../../jobs/queues.module.js';
import { HostelService } from './services/hostel.service.js';
import { HostelAllocationService } from './services/hostel-allocation.service.js';
import { HostelExeatService } from './services/hostel-exeat.service.js';
import { HostelCurfewService } from './services/hostel-curfew.service.js';
import { HostelAnalyticsService } from './services/hostel-analytics.service.js';
import { HostelController } from './controllers/hostel.controller.js';
import { HostelAllocationController } from './controllers/hostel-allocation.controller.js';
import { HostelExeatController } from './controllers/hostel-exeat.controller.js';
import { HostelCurfewController } from './controllers/hostel-curfew.controller.js';

@Module({
  imports: [PrismaModule, QueuesModule],
  controllers: [
    HostelController,
    HostelAllocationController,
    HostelExeatController,
    HostelCurfewController,
  ],
  providers: [
    HostelService,
    HostelAllocationService,
    HostelExeatService,
    HostelCurfewService,
    HostelAnalyticsService,
  ],
  exports: [
    HostelService,
    HostelAllocationService,
    HostelExeatService,
    HostelCurfewService,
    HostelAnalyticsService,
  ],
})
export class HostelModule {}
