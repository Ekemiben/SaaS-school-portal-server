import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateSyllabusTopicDto,
  UpdateSyllabusTopicDto,
  CompleteSyllabusTopicDto,
} from '../dto/syllabus-topic.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';

@Injectable()
export class SyllabusService {
  private readonly logger = new Logger(SyllabusService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createSyllabusTopic(
    tenantId: string,
    teacherUserId: string,
    dto: CreateSyllabusTopicDto,
  ) {
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

    const existingTopics = Array.from(this.prisma.memoryStore.syllabusTopics.values()).filter(
      (t) => t.tenantId === tenantId && t.classId === dto.classId && t.subjectId === dto.subjectId,
    );

    const id = `syl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const topic = {
      id,
      tenantId,
      classId: dto.classId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId || classRecord.academicYearId || null,
      termId: dto.termId || null,
      unitNumber: dto.unitNumber || 1,
      topicTitle: dto.topicTitle,
      description: dto.description || null,
      learningObjectives: dto.learningObjectives || [],
      estimatedHours: dto.estimatedHours || null,
      weekNumber: dto.weekNumber || null,
      orderIndex: dto.orderIndex ?? existingTopics.length,
      status: dto.status || 'PLANNED',
      completedAt: null,
      completedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.syllabusTopics.set(id, topic);

    return {
      ...topic,
      className: classRecord.name,
      subjectName: subject.name,
    };
  }

  async getSyllabusTopics(tenantId: string, classId: string, subjectId: string) {
    const classRecord = this.prisma.memoryStore.classes.get(classId);
    if (!classRecord || classRecord.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Class not found in this school',
      });
    }

    const subject = this.prisma.memoryStore.subjects.get(subjectId);
    if (!subject || subject.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Subject not found in this school',
      });
    }

    const topics = Array.from(this.prisma.memoryStore.syllabusTopics.values())
      .filter((t) => t.tenantId === tenantId && t.classId === classId && t.subjectId === subjectId)
      .sort((a, b) => {
        if (a.unitNumber !== b.unitNumber) return a.unitNumber - b.unitNumber;
        return a.orderIndex - b.orderIndex;
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
    const topic = this.prisma.memoryStore.syllabusTopics.get(id);
    if (!topic || topic.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Syllabus topic not found',
      });
    }

    const cls = this.prisma.memoryStore.classes.get(topic.classId);
    const sub = this.prisma.memoryStore.subjects.get(topic.subjectId);

    return {
      ...topic,
      className: cls?.name || 'Class',
      subjectName: sub?.name || 'Subject',
    };
  }

  async updateSyllabusTopic(tenantId: string, id: string, dto: UpdateSyllabusTopicDto) {
    const topic = await this.getSyllabusTopicById(tenantId, id);

    if (dto.topicTitle !== undefined) topic.topicTitle = dto.topicTitle;
    if (dto.description !== undefined) topic.description = dto.description;
    if (dto.learningObjectives !== undefined) topic.learningObjectives = dto.learningObjectives;
    if (dto.estimatedHours !== undefined) topic.estimatedHours = dto.estimatedHours;
    if (dto.weekNumber !== undefined) topic.weekNumber = dto.weekNumber;
    if (dto.orderIndex !== undefined) topic.orderIndex = dto.orderIndex;
    if (dto.status !== undefined) topic.status = dto.status;

    topic.updatedAt = new Date();
    this.prisma.memoryStore.syllabusTopics.set(id, topic);

    return topic;
  }

  async completeSyllabusTopic(
    tenantId: string,
    id: string,
    teacherUserId: string,
    dto: CompleteSyllabusTopicDto,
  ) {
    const topic = await this.getSyllabusTopicById(tenantId, id);

    topic.status = 'COMPLETED';
    topic.completedAt = new Date();
    topic.completedByUserId = teacherUserId;
    if (dto.notes) {
      topic.description = topic.description ? `${topic.description} | Note: ${dto.notes}` : dto.notes;
    }
    topic.updatedAt = new Date();

    this.prisma.memoryStore.syllabusTopics.set(id, topic);
    return topic;
  }

  async deleteSyllabusTopic(tenantId: string, id: string) {
    await this.getSyllabusTopicById(tenantId, id);
    this.prisma.memoryStore.syllabusTopics.delete(id);
    return { success: true, message: 'Syllabus topic deleted successfully' };
  }
}
