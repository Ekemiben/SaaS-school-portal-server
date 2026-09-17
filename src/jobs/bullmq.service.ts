import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { QueueService } from './queue.service.js';
import { JOB_DISPATCHER } from '../infrastructure/queues/contracts/job-dispatcher.interface.js';

/**
 * @deprecated BullMQ and Redis are strictly prohibited by Constitution v2.1.
 * Use QueueService or IJobDispatcher directly. This class is retained only for backward compatibility.
 */
@Injectable()
export class BullmqService extends QueueService {
  private readonly deprecationLogger = new Logger(BullmqService.name);

  constructor(
    @Optional() @Inject(JOB_DISPATCHER) dispatcherOrFirstArg?: any,
    @Optional() pgBossServiceOrSecondArg?: any,
  ) {
    super(dispatcherOrFirstArg, pgBossServiceOrSecondArg);
    this.deprecationLogger.warn(
      'BullmqService is deprecated per Architecture Constitution v2.1. Migrate injection to QueueService.',
    );
  }
}
