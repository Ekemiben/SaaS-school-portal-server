import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { SubmitHomeworkDto, ResubmitHomeworkDto } from '../dto/submit-homework.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';
import { HomeworkCoreService } from './homework-core.service.js';

@Injectable()
export class HomeworkSubmissionService {
  private readonly logger = new Logger(HomeworkSubmissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly homeworkCoreService: HomeworkCoreService,
  ) {}

  async submitHomework(tenantId: string, homeworkId: string, dto: SubmitHomeworkDto) {
    const homework = await this.homeworkCoreService.getHomeworkById(tenantId, homeworkId);

    if (homework.status !== 'PUBLISHED') {
      throw new BadRequestException({
        errorCode: ErrorCodes.VALIDATION_FAILED,
        message: `Submissions are closed for this assignment (status: ${homework.status})`,
      });
    }

    const student = this.prisma.memoryStore.students.get(dto.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    const now = new Date();
    const isLate = now > new Date(homework.dueDate);

    if (isLate && !homework.allowLateSubmissions) {
      throw new BadRequestException({
        errorCode: ErrorCodes.VALIDATION_FAILED,
        message: 'Deadline has passed and late submissions are not permitted for this assignment',
      });
    }

    // Check if an existing submission already exists
    const existingSubmission = Array.from(this.prisma.memoryStore.homeworkSubmissions.values()).find(
      (s) => s.tenantId === tenantId && s.homeworkId === homeworkId && s.studentId === dto.studentId,
    );

    let attachments = dto.attachmentUrls || [];
    if (dto.attachmentKey && attachments.length === 0) {
      attachments = [{ url: dto.attachmentKey, name: 'Submission File', sizeBytes: 0, mimeType: 'application/octet-stream' }];
    }

    const id = existingSubmission ? existingSubmission.id : `hws_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const submissionKey = `${homeworkId}_${dto.studentId}`;

    const submission = {
      id,
      submissionKey,
      tenantId,
      homeworkId,
      studentId: dto.studentId,
      submissionText: dto.submissionText || null,
      attachmentUrls: attachments,
      attachmentKey: dto.attachmentKey || (attachments[0]?.url || null),
      submittedAt: now,
      isLate,
      status: 'SUBMITTED',
      score: existingSubmission?.score ?? null,
      grade: existingSubmission?.grade ?? null,
      feedback: existingSubmission?.feedback ?? null,
      rubricScores: existingSubmission?.rubricScores ?? null,
      gradedAt: existingSubmission?.gradedAt ?? null,
      gradedByUserId: existingSubmission?.gradedByUserId ?? null,
      createdAt: existingSubmission?.createdAt || now,
      updatedAt: now,
    };

    this.prisma.memoryStore.homeworkSubmissions.set(id, submission);

    return {
      ...submission,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      homeworkTitle: homework.title,
      maxMarks: homework.maxMarks,
    };
  }

  async resubmitHomework(tenantId: string, submissionId: string, dto: ResubmitHomeworkDto) {
    const submission = this.prisma.memoryStore.homeworkSubmissions.get(submissionId);
    if (!submission || submission.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Homework submission not found',
      });
    }

    const homework = await this.homeworkCoreService.getHomeworkById(tenantId, submission.homeworkId);
    const now = new Date();
    const isLate = now > new Date(homework.dueDate);

    if (isLate && !homework.allowLateSubmissions) {
      throw new BadRequestException({
        errorCode: ErrorCodes.VALIDATION_FAILED,
        message: 'Cannot resubmit: deadline has passed and late submissions are not allowed',
      });
    }

    if (dto.submissionText !== undefined) submission.submissionText = dto.submissionText;
    if (dto.attachmentUrls !== undefined) {
      submission.attachmentUrls = dto.attachmentUrls;
      submission.attachmentKey = dto.attachmentUrls[0]?.url || null;
    }

    submission.submittedAt = now;
    submission.isLate = isLate;
    submission.status = 'SUBMITTED';
    submission.updatedAt = now;

    this.prisma.memoryStore.homeworkSubmissions.set(submissionId, submission);
    return submission;
  }

  async getSubmissions(tenantId: string, homeworkId: string) {
    await this.homeworkCoreService.getHomeworkById(tenantId, homeworkId);

    const submissions = Array.from(this.prisma.memoryStore.homeworkSubmissions.values())
      .filter((s) => s.tenantId === tenantId && s.homeworkId === homeworkId)
      .map((s) => {
        const student = this.prisma.memoryStore.students.get(s.studentId);
        return {
          ...s,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
          admissionNumber: student?.admissionNumber || '',
        };
      })
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    return submissions;
  }

  async getMySubmission(tenantId: string, homeworkId: string, studentId: string) {
    await this.homeworkCoreService.getHomeworkById(tenantId, homeworkId);

    const submission = Array.from(this.prisma.memoryStore.homeworkSubmissions.values()).find(
      (s) => s.tenantId === tenantId && s.homeworkId === homeworkId && s.studentId === studentId,
    );

    if (!submission) {
      return null;
    }

    const student = this.prisma.memoryStore.students.get(studentId);
    return {
      ...submission,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      admissionNumber: student?.admissionNumber || '',
    };
  }

  async getStudentSubmissions(tenantId: string, studentId: string) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    return Array.from(this.prisma.memoryStore.homeworkSubmissions.values())
      .filter((s) => s.tenantId === tenantId && s.studentId === studentId)
      .map((s) => {
        const hw = this.prisma.memoryStore.homework.get(s.homeworkId);
        const sub = hw ? this.prisma.memoryStore.subjects.get(hw.subjectId) : null;
        return {
          ...s,
          homeworkTitle: hw?.title || 'Assignment',
          dueDate: hw?.dueDate,
          maxMarks: hw?.maxMarks || 100,
          subjectName: sub?.name || 'Subject',
        };
      });
  }
}
