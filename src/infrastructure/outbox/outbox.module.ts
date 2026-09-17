import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service.js';
import { OutboxProcessor } from './outbox.processor.js';
import { PrismaModule } from '../../database/prisma.module.js';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [OutboxService, OutboxProcessor],
  exports: [OutboxService, OutboxProcessor],
})
export class OutboxModule {}
