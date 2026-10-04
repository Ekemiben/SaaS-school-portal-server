import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateSyllabusTopicDto,
  UpdateSyllabusTopicDto,
  CompleteSyllabusTopicDto,
} from '../dto/syllabus-topic.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';
import { randomUUID } from 'crypto';

@Injectable()
export class SyllabusService {
  private readonly logger = new Logger(SyllabusService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createSyllabusTopic(
    tenantId: string,
    teacherUserId: string,
    dto: CreateSyllabusTopicDto,
  ) {
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

    const existingCount = await this.prisma.syllabusTopic.count({
      where: { tenantId, classId: dto.classId, subjectId: dto.subjectId },
    });

    const id = `syl_${Date.now()}_${randomUUID().substring(0, 5)}`;
    const topic = await this.prisma.syllabusTopic.create({
      data: {
        id,
        tenantId,
        classId: dto.classId,
        subjectId: dto.subjectId,
        academicYearId: dto.academicYearId || classRecord.academicYearId || null,
        termId: dto.termId || null,
        unitNumber: dto.unitNumber || 1,
        topicTitle: dto.topicTitle,
        description: dto.description || null,
        learningObjectives: (dto.learningObjectives as any) || [],
        estimatedHours: dto.estimatedHours || null,
        weekNumber: dto.weekNumber || null,
        orderIndex: dto.orderIndex ?? existingCount,
        status: dto.status || 'PLANNED',
        completedAt: null,
        completedByUserId: null,
      },
      include: {
        class: true,
        subject: true,
      },
    });

    return {
      ...topic,
      className: classRecord.name,
      subjectName: subject.name,
    };
  }

  async getSyllabusTopics(tenantId: string, classId: string, subjectId: string) {
    const classRecord = await this.prisma.class.findFirst({
      where: { id: classId, tenantId },
    });
    if (!classRecord) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Class not found in this school',
      });
    }

    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, tenantId },
    });
    if (!subject) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Subject not found in this school',
      });
    }

    const topics = await this.prisma.syllabusTopic.findMany({
      where: { tenantId, classId, subjectId },
      orderBy: [
        { unitNumber: 'asc' },
        { orderIndex: 'asc' },
      ],
    });

    const totalTopics = topics.length;
    const completedTopics = topics.filter((t) => t.status === 'COMPLETED').length;
    const inProgressTopics = topics.filter((t) => t.status === 'IN_PROGRESS').length;
    const completionPercentage = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

    return {
      classId,
      className: classRecord.name,
      subjectId,
      subjectName: subject.name,
      totalTopics,
      completedTopics,
      inProgressTopics,
      completionPercentage,
      topics,
    };
  }

  async getSyllabusTopicById(tenantId: string, id: string) {
    const topic = await this.prisma.syllabusTopic.findFirst({
      where: { id, tenantId },
      include: {
        class: true,
        subject: true,
      },
    });

    if (!topic) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Syllabus topic not found',
      });
    }

    return {
      ...topic,
      className: topic.class?.name || 'Class',
      subjectName: topic.subject?.name || 'Subject',
    };
  }

  async updateSyllabusTopic(tenantId: string, id: string, dto: UpdateSyllabusTopicDto) {
    const existing = await this.prisma.syllabusTopic.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Syllabus topic not found',
      });
    }

    const updated = await this.prisma.syllabusTopic.update({
      where: { id },
      data: {
        ...(dto.topicTitle !== undefined ? { topicTitle: dto.topicTitle } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.learningObjectives !== undefined ? { learningObjectives: dto.learningObjectives as any } : {}),
        ...(dto.estimatedHours !== undefined ? { estimatedHours: dto.estimatedHours } : {}),
        ...(dto.weekNumber !== undefined ? { weekNumber: dto.weekNumber } : {}),
        ...(dto.orderIndex !== undefined ? { orderIndex: dto.orderIndex } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
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

  async completeSyllabusTopic(
    tenantId: string,
    id: string,
    teacherUserId: string,
    dto: CompleteSyllabusTopicDto,
  ) {
    const existing = await this.prisma.syllabusTopic.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Syllabus topic not found',
      });
    }

    let description = existing.description;
    if (dto.notes) {
      description = description ? `${description} | Note: ${dto.notes}` : dto.notes;
    }

    const updated = await this.prisma.syllabusTopic.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedByUserId: teacherUserId,
        ...(dto.notes ? { description } : {}),
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

  async deleteSyllabusTopic(tenantId: string, id: string) {
    const existing = await this.prisma.syllabusTopic.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Syllabus topic not found',
      });
    }

    await this.prisma.syllabusTopic.delete({
      where: { id },
    });

    return { success: true, message: 'Syllabus topic deleted successfully' };
  }
}
