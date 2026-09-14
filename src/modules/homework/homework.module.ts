import { Module } from '@nestjs/common';
import { HomeworkController } from './homework.controller.js';
import { LmsResourcesController } from './lms-resources.controller.js';
import { HomeworkService } from './homework.service.js';
import { HomeworkCoreService } from './services/homework-core.service.js';
import { HomeworkSubmissionService } from './services/homework-submission.service.js';
import { HomeworkGradingService } from './services/homework-grading.service.js';
import { StudyMaterialService } from './services/study-material.service.js';
import { SyllabusService } from './services/syllabus.service.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { QueuesModule } from '../../jobs/queues.module.js';

@Module({
  imports: [PrismaModule, QueuesModule],
  controllers: [HomeworkController, LmsResourcesController],
  providers: [
    HomeworkService,
    HomeworkCoreService,
    HomeworkSubmissionService,
    HomeworkGradingService,
    StudyMaterialService,
    SyllabusService,
  ],
  exports: [
    HomeworkService,
    HomeworkCoreService,
    HomeworkSubmissionService,
    HomeworkGradingService,
    StudyMaterialService,
    SyllabusService,
  ],
})
export class HomeworkModule {}
