import { Module } from '@nestjs/common';
import { AcademicsController } from './academics.controller.js';
import { AcademicsService } from './academics.service.js';
import { TeachersModule } from '../teachers/teachers.module.js';

@Module({
  imports: [TeachersModule],
  controllers: [AcademicsController],
  providers: [AcademicsService],
  exports: [AcademicsService],
})
export class AcademicsModule {}

