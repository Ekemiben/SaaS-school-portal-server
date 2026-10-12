import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { TransitionService } from './transition.service.js';
import { TransitionController } from './transition.controller.js';
import { ParentTransitionController } from './parent-transition.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [TransitionController, ParentTransitionController],
  providers: [TransitionService],
  exports: [TransitionService],
})
export class TransitionModule {}
