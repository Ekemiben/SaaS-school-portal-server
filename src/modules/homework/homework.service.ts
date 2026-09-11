import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateHomeworkDto, SubmitHomeworkDto, GradeHomeworkDto } from './dto/create-homework.dto.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';

@Injectable()
export class HomeworkService {
  constructor(private readonly prisma: PrismaService) {}

  async createHomework(tenantId: string, teacherUserId: string, dto: CreateHomeworkDto) {
    const id = `hw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const assignment = {
      id,
      tenantId,
      createdById: teacherUserId,
      ...dto,
      dueDate: new Date(dto.dueDate),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.homework.set(id, assignment);
    return assignment;
  }

  async getHomeworkByClass(tenantId: string, classId: string, subjectId?: string) {
    const assignments = Array.from(this.prisma.memoryStore.homework.values())
      .filter((h) => h.tenantId === tenantId && h.classId === classId && (!subjectId || h.subjectId === subjectId))
      .map((h) => {
        const subject = this.prisma.memoryStore.subjects.get(h.subjectId);
        const submissionsCount = Array.from(this.prisma.memoryStore.homeworkSubmissions.values())
          .filter((s) => s.homeworkId === h.id).length;

        return {
          ...h,
          subjectName: subject?.name || 'Subject',
          submissionsCount,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return assignments;
  }

  async getHomeworkById(tenantId: string, id: string) {
    const assignment = this.prisma.memoryStore.homework.get(id);
    if (!assignment || assignment.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Homework assignment not found',
      });
    }

    const subject = this.prisma.memoryStore.subjects.get(assignment.subjectId);
    return {
      ...assignment,
      subjectName: subject?.name || 'Subject',
    };
  }

  async submitHomework(tenantId: string, homeworkId: string, dto: SubmitHomeworkDto) {
    const homework = await this.getHomeworkById(tenantId, homeworkId);
    const existingSubmissionKey = `${homeworkId}_${dto.studentId}`;

    const id = `hws_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const submission = {
      id,
      submissionKey: existingSubmissionKey,
      tenantId,
      homeworkId,
      studentId: dto.studentId,
      submissionText: dto.submissionText || null,
      attachmentKey: dto.attachmentKey || null,
      submittedAt: new Date(),
      isLate: new Date() > new Date(homework.dueDate),
      status: 'SUBMITTED',
      score: null,
      feedback: null,
      gradedAt: null,
    };

    this.prisma.memoryStore.homeworkSubmissions.set(id, submission);
    return submission;
  }

  async getSubmissions(tenantId: string, homeworkId: string) {
    await this.getHomeworkById(tenantId, homeworkId);

    const submissions = Array.from(this.prisma.memoryStore.homeworkSubmissions.values())
      .filter((s) => s.tenantId === tenantId && s.homeworkId === homeworkId)
      .map((s) => {
        const student = this.prisma.memoryStore.students.get(s.studentId);
        return {
          ...s,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
          admissionNumber: student?.admissionNumber || '',
        };
      });

    return submissions;
  }

  async gradeSubmission(tenantId: string, submissionId: string, dto: GradeHomeworkDto) {
    const submission = this.prisma.memoryStore.homeworkSubmissions.get(submissionId);
    if (!submission || submission.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Homework submission not found',
      });
    }

    submission.score = dto.score;
    submission.feedback = dto.feedback || null;
    submission.status = 'GRADED';
    submission.gradedAt = new Date();

    this.prisma.memoryStore.homeworkSubmissions.set(submissionId, submission);
    return submission;
  }
}
