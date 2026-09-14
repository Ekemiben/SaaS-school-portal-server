import { Injectable } from '@nestjs/common';
import { CreateHomeworkDto, SubmitHomeworkDto, GradeHomeworkDto, HomeworkFilterDto } from './dto/create-homework.dto.js';
import { HomeworkCoreService } from './services/homework-core.service.js';
import { HomeworkSubmissionService } from './services/homework-submission.service.js';
import { HomeworkGradingService } from './services/homework-grading.service.js';

@Injectable()
export class HomeworkService {
  constructor(
    private readonly coreService: HomeworkCoreService,
    private readonly submissionService: HomeworkSubmissionService,
    private readonly gradingService: HomeworkGradingService,
  ) {}

  createHomework(tenantId: string, teacherUserId: string, dto: CreateHomeworkDto) {
    return this.coreService.createHomework(tenantId, teacherUserId, dto);
  }

  getHomeworkByClass(tenantId: string, classId: string, subjectId?: string) {
    return this.coreService.getHomeworkList(tenantId, { classId, subjectId });
  }

  getHomeworkList(tenantId: string, filter: HomeworkFilterDto) {
    return this.coreService.getHomeworkList(tenantId, filter);
  }

  getHomeworkById(tenantId: string, id: string) {
    return this.coreService.getHomeworkById(tenantId, id);
  }

  submitHomework(tenantId: string, homeworkId: string, dto: SubmitHomeworkDto) {
    return this.submissionService.submitHomework(tenantId, homeworkId, dto);
  }

  getSubmissions(tenantId: string, homeworkId: string) {
    return this.submissionService.getSubmissions(tenantId, homeworkId);
  }

  gradeSubmission(tenantId: string, submissionId: string, dto: GradeHomeworkDto, teacherUserId?: string) {
    return this.gradingService.gradeSubmission(
      tenantId,
      submissionId,
      teacherUserId || 'teacher_evaluator',
      dto,
    );
  }
}
