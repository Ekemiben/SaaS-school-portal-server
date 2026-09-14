import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { GradeHomeworkDto, BulkGradeSubmissionDto } from '../dto/grade-homework.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';
import { QueueService } from '../../../jobs/queue.service.js';
import { QUEUES } from '../../../jobs/queue.constants.js';

@Injectable()
export class HomeworkGradingService {
  private readonly logger = new Logger(HomeworkGradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async gradeSubmission(
    tenantId: string,
    submissionId: string,
    teacherUserId: string,
    dto: GradeHomeworkDto,
  ) {
    const submission = this.prisma.memoryStore.homeworkSubmissions.get(submissionId);
    if (!submission || submission.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Homework submission not found',
      });
    }

    const homework = this.prisma.memoryStore.homework.get(submission.homeworkId);
    if (!homework || homework.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Associated homework assignment not found',
      });
    }

    const maxMarks = homework.maxMarks || 100;
    if (dto.score < 0 || dto.score > maxMarks) {
      throw new BadRequestException({
        errorCode: ErrorCodes.VALIDATION_FAILED,
        message: `Score must be between 0 and ${maxMarks}`,
      });
    }

    const calculatedGrade = dto.grade || this.deriveLetterGrade(dto.score, maxMarks);

    submission.score = dto.score;
    submission.grade = calculatedGrade;
    submission.feedback = dto.feedback || null;
    submission.rubricScores = dto.rubricScores || null;
    submission.status = dto.status || 'GRADED';
    submission.gradedAt = new Date();
    submission.gradedByUserId = teacherUserId;
    submission.updatedAt = new Date();

    this.prisma.memoryStore.homeworkSubmissions.set(submissionId, submission);

    this.dispatchGradingNotification(tenantId, submission, homework).catch((err) =>
      this.logger.warn(`Failed to dispatch grading notification: ${err.message}`),
    );

    const student = this.prisma.memoryStore.students.get(submission.studentId);
    return {
      ...submission,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      admissionNumber: student?.admissionNumber || '',
      homeworkTitle: homework.title,
      maxMarks,
    };
  }

  async bulkGrade(
    tenantId: string,
    homeworkId: string,
    teacherUserId: string,
    dto: BulkGradeSubmissionDto,
  ) {
    const homework = this.prisma.memoryStore.homework.get(homeworkId);
    if (!homework || homework.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Homework assignment not found',
      });
    }

    const gradedResults = [];
    for (const item of dto.grades) {
      const graded = await this.gradeSubmission(tenantId, item.submissionId, teacherUserId, {
        score: item.score,
        grade: item.grade,
        feedback: item.feedback,
        status: 'GRADED',
      });
      gradedResults.push(graded);
    }

    return {
      count: gradedResults.length,
      submissions: gradedResults,
    };
  }

  private deriveLetterGrade(score: number, maxMarks: number): string {
    const percentage = (score / maxMarks) * 100;
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 50) return 'D';
    return 'F';
  }

  private async dispatchGradingNotification(tenantId: string, submission: any, homework: any) {
    try {
      await this.queueService.addJob(
        QUEUES.NOTIFICATIONS,
        'homework_graded_notification',
        {
          tenantId,
          type: 'HOMEWORK_GRADED',
          submissionId: submission.id,
          homeworkId: homework.id,
          studentId: submission.studentId,
          homeworkTitle: homework.title,
          score: submission.score,
          maxMarks: homework.maxMarks,
          feedback: submission.feedback,
        },
      );
    } catch (err: any) {
      this.logger.warn(`Grading notification queueing failed safely: ${err.message}`);
    }
  }
}
