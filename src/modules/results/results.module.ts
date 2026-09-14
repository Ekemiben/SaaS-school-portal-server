import { Module } from '@nestjs/common';
import { ResultsController } from './results.controller.js';
import { ResultsService } from './results.service.js';
import { AcademicSummaryService } from './services/academic-summary.service.js';
import { ReportCardService } from './services/report-card.service.js';
import { FilesModule } from '../files/files.module.js';
import { QueuesModule } from '../../jobs/queues.module.js';

@Module({
  imports: [FilesModule, QueuesModule],
  controllers: [ResultsController],
  providers: [ResultsService, AcademicSummaryService, ReportCardService],
  exports: [ResultsService, AcademicSummaryService, ReportCardService],
})
export class ResultsModule {}
