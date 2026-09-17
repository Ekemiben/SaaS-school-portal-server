import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PgBossService } from './pg-boss.service.js';
import { PgBossDispatcher } from './pg-boss.dispatcher.js';
import { JOB_DISPATCHER } from '../contracts/job-dispatcher.interface.js';
import { QueueMetricsService } from '../monitoring/queue-metrics.service.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    PgBossService,
    PgBossDispatcher,
    QueueMetricsService,
    {
      provide: JOB_DISPATCHER,
      useExisting: PgBossDispatcher,
    },
  ],
  exports: [PgBossService, PgBossDispatcher, JOB_DISPATCHER, QueueMetricsService],
})
export class PgBossModule {}
