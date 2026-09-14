import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreateHomeworkDto, UpdateHomeworkDto, HomeworkFilterDto } from '../dto/create-homework.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';
import { QueueService } from '../../../jobs/queue.service.js';
import { QUEUES } from '../../../jobs/queue.constants.js';

@Injectable()
export class HomeworkCoreService {
  private readonly logger = new Logger(HomeworkCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async createHomework(tenantId: string, teacherUserId: string, dto: CreateHomeworkDto) {
    const classRecord = this.prisma.memoryStore.classes.get(dto.classId);
    if (!classRecord || classRecord.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Class not found in this school',
      });
    }

    const subject = this.prisma.memoryStore.subjects.get(dto.subjectId);
    if (!subject || subject.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Subject not found in this school',
      });
    }

    const id = `hw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const dueDate = new Date(dto.dueDate);

    // Normalize attachments
    let attachments = dto.attachments || [];
    if (dto.attachmentKey && attachments.length === 0) {
      attachments = [{ url: dto.attachmentKey, name: 'Attachment', sizeBytes: 0, mimeType: 'application/octet-stream' }];
    }

    const assignment = {
      id,
      tenantId,
      campusId: dto.campusId || classRecord.campusId || null,
      classId: dto.classId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId || classRecord.academicYearId || null,
      termId: dto.termId || null,
      createdById: teacherUserId,
      title: dto.title,
      description: dto.description,
      dueDate,
      maxMarks: dto.maxMarks ?? 100,
      passingMarks: dto.passingMarks ?? null,
      allowLateSubmissions: dto.allowLateSubmissions ?? true,
      latePenaltyPercent: dto.latePenaltyPercent ?? 0,
      status: dto.status || 'PUBLISHED',
      attachments,
      rubricCriteria: dto.rubricCriteria || [],
      targetGroup: dto.targetGroup || 'ALL',
      selectedStudentIds: dto.selectedStudentIds || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.homework.set(id, assignment);

    if (assignment.status === 'PUBLISHED') {
      this.dispatchAssignmentNotification(tenantId, assignment).catch((err) =>
        this.logger.warn(`Failed to dispatch assignment notification: ${err.message}`),
      );
    }

    return {
      ...assignment,
      className: classRecord.name,
      subjectName: subject.name,
    };
  }

  async getHomeworkList(tenantId: string, filter: HomeworkFilterDto) {
    let assignments = Array.from(this.prisma.memoryStore.homework.values()).filter(
      (h) => h.tenantId === tenantId,
    );

    if (filter.classId) {
      assignments = assignments.filter((h) => h.classId === filter.classId);
    }
    if (filter.subjectId) {
      assignments = assignments.filter((h) => h.subjectId === filter.subjectId);
    }
    if (filter.campusId) {
      assignments = assignments.filter((h) => h.campusId === filter.campusId);
    }
    if (filter.status) {
      assignments = assignments.filter((h) => h.status === filter.status);
    }

    return assignments
      .map((h) => {
        const cls = this.prisma.memoryStore.classes.get(h.classId);
        const sub = this.prisma.memoryStore.subjects.get(h.subjectId);
        const submissionsCount = Array.from(this.prisma.memoryStore.homeworkSubmissions.values()).filter(
          (s) => s.tenantId === tenantId && s.homeworkId === h.id,
        ).length;

        return {
          ...h,
          className: cls?.name || 'Class',
          subjectName: sub?.name || 'Subject',
          submissionsCount,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getHomeworkById(tenantId: string, id: string) {
    const assignment = this.prisma.memoryStore.homework.get(id);
    if (!assignment || assignment.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Homework assignment not found',
      });
    }

    const cls = this.prisma.memoryStore.classes.get(assignment.classId);
    const sub = this.prisma.memoryStore.subjects.get(assignment.subjectId);
    const submissions = Array.from(this.prisma.memoryStore.homeworkSubmissions.values()).filter(
      (s) => s.tenantId === tenantId && s.homeworkId === id,
    );

    return {
      ...assignment,
      className: cls?.name || 'Class',
      subjectName: sub?.name || 'Subject',
      submissionsCount: submissions.length,
      gradedCount: submissions.filter((s) => s.status === 'GRADED').length,
    };
  }

  async updateHomework(tenantId: string, id: string, dto: UpdateHomeworkDto) {
    const assignment = await this.getHomeworkById(tenantId, id);

    if (dto.title !== undefined) assignment.title = dto.title;
    if (dto.description !== undefined) assignment.description = dto.description;
    if (dto.dueDate !== undefined) assignment.dueDate = new Date(dto.dueDate);
    if (dto.maxMarks !== undefined) assignment.maxMarks = dto.maxMarks;
    if (dto.passingMarks !== undefined) assignment.passingMarks = dto.passingMarks;
    if (dto.allowLateSubmissions !== undefined) assignment.allowLateSubmissions = dto.allowLateSubmissions;
    if (dto.latePenaltyPercent !== undefined) assignment.latePenaltyPercent = dto.latePenaltyPercent;
    if (dto.status !== undefined) assignment.status = dto.status;
    if (dto.attachments !== undefined) assignment.attachments = dto.attachments;
    if (dto.rubricCriteria !== undefined) assignment.rubricCriteria = dto.rubricCriteria;

    assignment.updatedAt = new Date();
    this.prisma.memoryStore.homework.set(id, assignment);

    return assignment;
  }

  async deleteHomework(tenantId: string, id: string) {
    await this.getHomeworkById(tenantId, id);
    this.prisma.memoryStore.homework.delete(id);
    return { success: true, message: 'Homework assignment deleted successfully' };
  }

  private async dispatchAssignmentNotification(tenantId: string, assignment: any) {
    try {
      await this.queueService.addJob(
        QUEUES.NOTIFICATIONS,
        'homework_assignment_notification',
        {
          tenantId,
          type: 'NEW_HOMEWORK_ASSIGNED',
          homeworkId: assignment.id,
          classId: assignment.classId,
          subjectId: assignment.subjectId,
          title: assignment.title,
          dueDate: assignment.dueDate,
        },
      );
    } catch (err: any) {
      this.logger.warn(`Assignment notification queueing failed safely: ${err.message}`);
    }
  }
}
