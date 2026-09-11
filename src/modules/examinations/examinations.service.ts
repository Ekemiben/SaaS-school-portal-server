import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class ExaminationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, campusId?: string) {
    return Array.from(this.prisma.memoryStore.examinations.values()).filter(
      (e) => e.tenantId === tenantId && (!campusId || e.campusId === campusId),
    );
  }

  async findById(tenantId: string, examId: string) {
    const exam = this.prisma.memoryStore.examinations.get(examId);
    if (!exam || exam.tenantId !== tenantId) {
      throw new NotFoundException('Examination not found');
    }
    return exam;
  }

  async create(tenantId: string, data: any) {
    const id = `exam_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const exam = {
      id,
      tenantId,
      campusId: data.campusId,
      academicYearId: data.academicYearId,
      termId: data.termId,
      name: data.name,
      examType: data.examType || 'TERM_EXAM',
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      isPublished: false,
      createdAt: new Date(),
    };
    this.prisma.memoryStore.examinations.set(id, exam);
    return exam;
  }

  async publish(tenantId: string, examId: string) {
    const exam = await this.findById(tenantId, examId);
    exam.isPublished = true;
    this.prisma.memoryStore.examinations.set(examId, exam);
    return exam;
  }
}
