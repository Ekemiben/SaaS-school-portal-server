import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';
import { StudentEnrollmentController } from './controllers/student-enrollment.controller.js';
import { StudentProgressionController } from './controllers/student-progression.controller.js';
import { StudentLifecycleController } from './controllers/student-lifecycle.controller.js';
import { StudentEnrollmentService } from './services/student-enrollment.service.js';
import { StudentProgressionService } from './services/student-progression.service.js';
import { StudentTransferService } from './services/student-transfer.service.js';
import { StudentLifecycleService } from './services/student-lifecycle.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    StudentsController,
    StudentEnrollmentController,
    StudentProgressionController,
    StudentLifecycleController,
  ],
  providers: [
    StudentsService,
    StudentEnrollmentService,
    StudentProgressionService,
    StudentTransferService,
    StudentLifecycleService,
  ],
  exports: [
    StudentsService,
    StudentEnrollmentService,
    StudentProgressionService,
    StudentTransferService,
    StudentLifecycleService,
  ],
})
export class StudentsModule {}
