import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { SubmitHomeworkDto, ResubmitHomeworkDto } from '../dto/submit-homework.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';
import { HomeworkCoreService } from './homework-core.service.js';
import { randomUUID } from 'crypto';

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

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
    });
    if (!student) {
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

    let attachments = dto.attachmentUrls || [];
    if (dto.attachmentKey && attachments.length === 0) {
      attachments = [{ url: dto.attachmentKey, name: 'Submission File', sizeBytes: 0, mimeType: 'application/octet-stream' }];
    }

    const id = `hws_${Date.now()}_${randomUUID().substring(0, 5)}`;

    const submission = await this.prisma.homeworkSubmission.upsert({
      where: {
        homeworkId_studentId: {
          homeworkId,
          studentId: dto.studentId,
        },
      },
      update: {
        submissionText: dto.submissionText || null,
        attachmentUrls: attachments as any,
        submittedAt: now,
        isLate,
        status: 'SUBMITTED',
      },
      create: {
        id,
        tenantId,
        homeworkId,
        studentId: dto.studentId,
        submissionText: dto.submissionText || null,
        attachmentUrls: attachments as any,
        submittedAt: now,
        isLate,
        status: 'SUBMITTED',
      },
      include: {
        student: true,
        homework: true,
      },
    });

    return {
      ...submission,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      homeworkTitle: homework.title,
      maxMarks: homework.maxMarks,
    };
  }

  async resubmitHomework(tenantId: string, submissionId: string, dto: ResubmitHomeworkDto) {
    const submission = await this.prisma.homeworkSubmission.findFirst({
      where: { id: submissionId, tenantId },
      include: { homework: true },
    });

    if (!submission) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Homework submission not found',
      });
    }

    const homework = submission.homework;
    const now = new Date();
    const isLate = now > new Date(homework.dueDate);

    if (isLate && !homework.allowLateSubmissions) {
      throw new BadRequestException({
        errorCode: ErrorCodes.VALIDATION_FAILED,
        message: 'Cannot resubmit: deadline has passed and late submissions are not allowed',
      });
    }

    const updated = await this.prisma.homeworkSubmission.update({
      where: { id: submissionId },
      data: {
        ...(dto.submissionText !== undefined ? { submissionText: dto.submissionText } : {}),
        ...(dto.attachmentUrls !== undefined ? { attachmentUrls: dto.attachmentUrls as any } : {}),
        submittedAt: now,
        isLate,
        status: 'SUBMITTED',
      },
    });

    return updated;
  }

  async getSubmissions(tenantId: string, homeworkId: string) {
    await this.homeworkCoreService.getHomeworkById(tenantId, homeworkId);

    const submissions = await this.prisma.homeworkSubmission.findMany({
      where: { tenantId, homeworkId },
      include: { student: true },
      orderBy: { submittedAt: 'desc' },
    });

    return submissions.map((s) => ({
      ...s,
      studentName: s.student ? `${s.student.firstName} ${s.student.lastName}` : 'Student',
      admissionNumber: s.student?.admissionNumber || '',
    }));
  }

  async getMySubmission(tenantId: string, homeworkId: string, studentId: string) {
    await this.homeworkCoreService.getHomeworkById(tenantId, homeworkId);

    const submission = await this.prisma.homeworkSubmission.findFirst({
      where: { tenantId, homeworkId, studentId },
      include: { student: true },
    });

    if (!submission) {
      return null;
    }

    return {
      ...submission,
      studentName: submission.student ? `${submission.student.firstName} ${submission.student.lastName}` : 'Student',
      admissionNumber: submission.student?.admissionNumber || '',
    };
  }

  async getStudentSubmissions(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });

    if (!student) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    const submissions = await this.prisma.homeworkSubmission.findMany({
      where: { tenantId, studentId },
      include: {
        homework: {
          include: {
            subject: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return submissions.map((s) => ({
      ...s,
      homeworkTitle: s.homework?.title || 'Assignment',
      dueDate: s.homework?.dueDate,
      maxMarks: s.homework?.maxMarks || 100,
      subjectName: s.homework?.subject?.name || 'Subject',
    }));
  }
}
