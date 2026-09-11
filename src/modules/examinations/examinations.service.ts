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

  // --- Grading Scales ---
  async getGradingScales(tenantId: string) {
    const custom = Array.from(this.prisma.memoryStore.gradingScales.values()).filter(
      (gs) => gs.tenantId === tenantId,
    );

    if (custom.length > 0) return custom;

    // Default standard grading scale
    return [
      {
        id: 'scale_default_standard',
        tenantId,
        name: 'Standard Secondary Scale',
        rules: [
          { grade: 'A1', minScore: 75, maxScore: 100, gpa: 4.0, remark: 'Distinction' },
          { grade: 'B2', minScore: 70, maxScore: 74, gpa: 3.5, remark: 'Very Good' },
          { grade: 'B3', minScore: 65, maxScore: 69, gpa: 3.0, remark: 'Good' },
          { grade: 'C4', minScore: 60, maxScore: 64, gpa: 2.5, remark: 'Credit' },
          { grade: 'C5', minScore: 55, maxScore: 59, gpa: 2.0, remark: 'Credit' },
          { grade: 'C6', minScore: 50, maxScore: 54, gpa: 1.5, remark: 'Credit' },
          { grade: 'D7', minScore: 45, maxScore: 49, gpa: 1.0, remark: 'Pass' },
          { grade: 'E8', minScore: 40, maxScore: 44, gpa: 0.5, remark: 'Pass' },
          { grade: 'F9', minScore: 0, maxScore: 39, gpa: 0.0, remark: 'Fail' },
        ],
      },
    ];
  }

  async createGradingScale(tenantId: string, data: { name: string; rules: any[] }) {
    const id = `gs_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const scale = {
      id,
      tenantId,
      name: data.name,
      rules: data.rules,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.gradingScales.set(id, scale);
    return scale;
  }
}
