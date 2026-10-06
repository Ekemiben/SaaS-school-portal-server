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
    const classRecord = await this.prisma.class.findFirst({
      where: { id: dto.classId, tenantId },
    });
    if (!classRecord) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Class not found in this school',
      });
    }

    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, tenantId },
    });
    if (!subject) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Subject not found in this school',
      });
    }

    const dueDate = new Date(dto.dueDate);

    // Normalize attachments
    let attachments = dto.attachments || [];
    if (dto.attachmentKey && attachments.length === 0) {
      attachments = [{ url: dto.attachmentKey, name: 'Attachment', sizeBytes: 0, mimeType: 'application/octet-stream' }];
    }

    const assignment = await this.prisma.homework.create({
      data: {
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
        maxMarks: dto.maxMarks ?? (dto as any).maxScore ?? 100,
        passingMarks: dto.passingMarks ?? null,
        allowLateSubmissions: dto.allowLateSubmissions ?? true,
        latePenaltyPercent: dto.latePenaltyPercent ?? 0,
        status: dto.status || 'PUBLISHED',
        attachments: attachments as any,
        rubricCriteria: (dto.rubricCriteria as any) || [],
        targetGroup: dto.targetGroup || 'ALL',
        selectedStudentIds: (dto.selectedStudentIds as any) || [],
      },
      include: {
        class: true,
        subject: true,
      },
    });

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
    const assignments = await this.prisma.homework.findMany({
      where: {
        tenantId,
        ...(filter.classId ? { classId: filter.classId } : {}),
        ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
        ...(filter.campusId ? { campusId: filter.campusId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      include: {
        class: true,
        subject: true,
        _count: {
          select: { submissions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return assignments.map((h) => ({
      ...h,
      className: h.class?.name || 'Class',
      subjectName: h.subject?.name || 'Subject',
      submissionsCount: h._count.submissions,
    }));
  }

  async getHomeworkById(tenantId: string, id: string) {
    const assignment = await this.prisma.homework.findFirst({
      where: { id, tenantId },
      include: {
        class: true,
        subject: true,
        submissions: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Homework assignment not found',
      });
    }

    const submissions = assignment.submissions;

    return {
      ...assignment,
      className: assignment.class?.name || 'Class',
      subjectName: assignment.subject?.name || 'Subject',
      submissionsCount: submissions.length,
      gradedCount: submissions.filter((s) => s.status === 'GRADED').length,
    };
  }

  async updateHomework(tenantId: string, id: string, dto: UpdateHomeworkDto) {
    const existing = await this.prisma.homework.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Homework assignment not found',
      });
    }

    const updated = await this.prisma.homework.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.maxMarks !== undefined ? { maxMarks: dto.maxMarks } : {}),
        ...(dto.passingMarks !== undefined ? { passingMarks: dto.passingMarks } : {}),
        ...(dto.allowLateSubmissions !== undefined ? { allowLateSubmissions: dto.allowLateSubmissions } : {}),
        ...(dto.latePenaltyPercent !== undefined ? { latePenaltyPercent: dto.latePenaltyPercent } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.attachments !== undefined ? { attachments: dto.attachments as any } : {}),
        ...(dto.rubricCriteria !== undefined ? { rubricCriteria: dto.rubricCriteria as any } : {}),
      },
      include: {
        class: true,
        subject: true,
      },
    });

    return {
      ...updated,
      className: updated.class?.name || 'Class',
      subjectName: updated.subject?.name || 'Subject',
    };
  }

  async deleteHomework(tenantId: string, id: string) {
    const existing = await this.prisma.homework.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Homework assignment not found',
      });
    }

    await this.prisma.homework.delete({
      where: { id },
    });

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
