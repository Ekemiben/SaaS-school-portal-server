import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class ExaminationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, campusId?: string) {
    return Array.from(this.prisma.memoryStore.examinations.values())
      .filter((e: any) => e.tenantId === tenantId && (!campusId || e.campusId === campusId))
      .map((e: any) => ({
        ...e,
        title: e.title || e.name,
        name: e.name || e.title,
        session: e.session || '2024/2025',
        term: e.term || 'First Term',
        papersCount: e.papers ? e.papers.length : e.papersCount || 0,
        hallCount: e.hallCount || 3,
        status: e.status || (e.isPublished ? 'Published / Completed' : 'Scheduled'),
        registeredCandidates: e.registeredCandidates || 540,
        moderationProgress: e.moderationProgress || 0,
        papers: e.papers || [],
      }));
  }

  async findById(tenantId: string, examId: string) {
    const exam = this.prisma.memoryStore.examinations.get(examId);
    if (!exam || exam.tenantId !== tenantId) {
      throw new NotFoundException('Examination not found');
    }
    return {
      ...exam,
      title: exam.title || exam.name,
      papersCount: exam.papers ? exam.papers.length : exam.papersCount || 0,
      papers: exam.papers || [],
    };
  }

  async create(tenantId: string, data: any) {
    const id = data.id || `exam_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const exam = {
      id,
      tenantId,
      campusId: data.campusId || 'campus_main_01',
      academicYearId: data.academicYearId || 'ay_2026_2027',
      termId: data.termId || 'term_first_2026',
      title: data.title || data.name || 'Terminal Examination',
      name: data.name || data.title || 'Terminal Examination',
      examType: data.examType || 'Terminal Examination',
      session: data.session || '2024/2025',
      term: data.term || 'First Term',
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      status: data.status || 'Scheduled',
      registeredCandidates: data.registeredCandidates || 540,
      hallCount: data.hallCount || 3,
      papersCount: data.papers ? data.papers.length : data.papersCount || 0,
      moderationProgress: data.moderationProgress || 0,
      instructions: data.instructions || '',
      papers: data.papers || [],
      isPublished: data.status === 'Published / Completed' || !!data.isPublished,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.examinations.set(id, exam);
    return exam;
  }

  async update(tenantId: string, examId: string, data: any) {
    const exam = await this.findById(tenantId, examId);
    const updated = {
      ...exam,
      ...data,
      title: data.title || data.name || exam.title,
      name: data.name || data.title || exam.name,
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.examinations.set(examId, updated);
    return updated;
  }

  async delete(tenantId: string, examId: string) {
    const exam = await this.findById(tenantId, examId);
    this.prisma.memoryStore.examinations.delete(examId);
    return { success: true, message: `Exam series "${exam.title}" deleted successfully.` };
  }

  async publish(tenantId: string, examId: string) {
    const exam = await this.findById(tenantId, examId);
    exam.isPublished = true;
    exam.status = 'Published / Completed';
    exam.moderationProgress = 100;
    exam.updatedAt = new Date();
    this.prisma.memoryStore.examinations.set(examId, exam);
    return exam;
  }

  // --- Exam Papers ---
  async addPaper(tenantId: string, examId: string, paperData: any) {
    const exam = await this.findById(tenantId, examId);
    const paperId = paperData.id || `paper_${randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const newPaper = {
      ...paperData,
      id: paperId,
      examCycleId: examId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (!exam.papers) exam.papers = [];
    exam.papers.push(newPaper);
    exam.papersCount = exam.papers.length;
    exam.updatedAt = new Date();
    this.prisma.memoryStore.examinations.set(examId, exam);
    return newPaper;
  }

  async updatePaper(tenantId: string, examId: string, paperId: string, paperData: any) {
    const exam = await this.findById(tenantId, examId);
    if (!exam.papers) exam.papers = [];
    const idx = exam.papers.findIndex((p: any) => p.id === paperId);
    if (idx >= 0) {
      exam.papers[idx] = { ...exam.papers[idx], ...paperData, updatedAt: new Date() };
    }
    exam.updatedAt = new Date();
    this.prisma.memoryStore.examinations.set(examId, exam);
    return exam.papers[idx] || paperData;
  }

  async deletePaper(tenantId: string, examId: string, paperId: string) {
    const exam = await this.findById(tenantId, examId);
    if (!exam.papers) exam.papers = [];
    exam.papers = exam.papers.filter((p: any) => p.id !== paperId);
    exam.papersCount = exam.papers.length;
    exam.updatedAt = new Date();
    this.prisma.memoryStore.examinations.set(examId, exam);
    return { success: true, message: 'Paper removed' };
  }

  // --- Grading Scales ---
  async getGradingScales(tenantId: string) {
    const custom = Array.from(this.prisma.memoryStore.gradingScales.values()).filter(
      (gs) => gs.tenantId === tenantId,
    );

    if (custom.length > 0) return custom;

    return [
      {
        id: 'scale_waec',
        tenantId,
        name: 'WAEC / WASSCE Standard 9-Point Scale',
        code: 'WAEC_9P',
        description: 'Standard West African Examinations Council grading scale used for Senior Secondary.',
        division: 'Senior Secondary (SSS 1 - SSS 3)',
        passThreshold: 50,
        bands: [
          { id: 'b1', symbol: 'A1', minScore: 75, maxScore: 100, gradePoint: 4.0, remark: 'Excellent / Distinction', badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { id: 'b2', symbol: 'B2', minScore: 70, maxScore: 74, gradePoint: 3.6, remark: 'Very Good', badgeColor: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
          { id: 'b3', symbol: 'B3', minScore: 65, maxScore: 69, gradePoint: 3.2, remark: 'Good', badgeColor: 'text-teal-700 bg-teal-50 border-teal-200' },
          { id: 'b4', symbol: 'C4', minScore: 60, maxScore: 64, gradePoint: 2.8, remark: 'Credit (High)', badgeColor: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
          { id: 'b5', symbol: 'C5', minScore: 55, maxScore: 59, gradePoint: 2.4, remark: 'Credit (Middle)', badgeColor: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
          { id: 'b6', symbol: 'C6', minScore: 50, maxScore: 54, gradePoint: 2.0, remark: 'Credit (Pass)', badgeColor: 'text-blue-700 bg-blue-50 border-blue-200' },
          { id: 'b7', symbol: 'D7', minScore: 45, maxScore: 49, gradePoint: 1.6, remark: 'Pass (Weak)', badgeColor: 'text-amber-700 bg-amber-50 border-amber-200' },
          { id: 'b8', symbol: 'E8', minScore: 40, maxScore: 44, gradePoint: 1.2, remark: 'Pass (Marginal)', badgeColor: 'text-orange-700 bg-orange-50 border-orange-200' },
          { id: 'b9', symbol: 'F9', minScore: 0, maxScore: 39, gradePoint: 0.0, remark: 'Fail', badgeColor: 'text-rose-700 bg-rose-50 border-rose-200' },
        ],
      },
    ];
  }

  async createGradingScale(tenantId: string, data: any) {
    const id = data.id || `gs_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const scale = {
      id,
      tenantId,
      name: data.name,
      code: data.code || data.name.toUpperCase().replace(/\s+/g, '_'),
      description: data.description || '',
      division: data.division || 'Senior Secondary',
      passThreshold: Number(data.passThreshold) || 50,
      bands: data.bands || data.rules || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.gradingScales.set(id, scale);
    return scale;
  }

  async updateGradingScale(tenantId: string, scaleId: string, data: any) {
    let scale = this.prisma.memoryStore.gradingScales.get(scaleId);
    if (!scale || scale.tenantId !== tenantId) {
      scale = {
        id: scaleId,
        tenantId,
        name: data.name || 'Grading Scale',
        code: data.code || 'SCALE',
        description: data.description || '',
        division: data.division || 'Senior Secondary',
        passThreshold: Number(data.passThreshold) || 50,
        bands: data.bands || data.rules || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      Object.assign(scale, data, {
        bands: data.bands || data.rules || scale.bands,
        updatedAt: new Date(),
      });
    }
    this.prisma.memoryStore.gradingScales.set(scaleId, scale);
    return scale;
  }

  async deleteGradingScale(tenantId: string, scaleId: string) {
    this.prisma.memoryStore.gradingScales.delete(scaleId);
    return { success: true, message: 'Grading scale deleted' };
  }
}
