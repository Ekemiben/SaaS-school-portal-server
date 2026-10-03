import { Module, forwardRef } from '@nestjs/common';
import { ParentsController } from './parents.controller.js';
import { ParentsService } from './parents.service.js';
import { ResultsModule } from '../results/results.module.js';
import { TransportModule } from '../transport/transport.module.js';

@Module({
  imports: [
    forwardRef(() => ResultsModule),
    forwardRef(() => TransportModule),
  ],
  controllers: [ParentsController],
  providers: [ParentsService],
  exports: [ParentsService],
})
export class ParentsModule {}

