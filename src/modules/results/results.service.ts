import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import {
  CreateAssessmentStructureDto,
  UpdateAssessmentStructureDto,
  EnterWeightedScoreDto,
  BulkEnterWeightedScoresDto,
  EvaluateAssessmentDto,
  AssessmentComponentDto,
} from './dto/assessment.dto.js';
import {
  WeightedAssessmentCalculator,
  DEFAULT_GRADING_RULES,
} from './calculator/weighted-assessment-calculator.js';

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Assessment Structures ---
  async listAssessmentStructures(tenantId: string, campusId?: string) {
    let list = Array.from(this.prisma.memoryStore.assessmentStructures?.values() || []).filter(
      (s: any) => s.tenantId === tenantId,
    );
    if (campusId) {
      list = list.filter((s: any) => !s.campusId || s.campusId === campusId);
    }
    if (list.length === 0) {
      const defaultStructure = this.getDefaultAssessmentStructure(tenantId);
      list.push(defaultStructure);
    }
    return list;
  }

  async getAssessmentStructure(tenantId: string, id: string) {
    if (id === 'default' || id === 'struct_default_standard') {
      return this.getDefaultAssessmentStructure(tenantId);
    }
    const struct = this.prisma.memoryStore.assessmentStructures?.get(id);
    if (!struct || struct.tenantId !== tenantId) {
      throw new NotFoundException('Assessment structure not found');
    }
    return struct;
  }

  async createAssessmentStructure(tenantId: string, dto: CreateAssessmentStructureDto) {
    const totalWeight = dto.components.reduce((sum, c) => sum + (c.weight || 0), 0);
    if (Math.round(totalWeight) !== 100) {
      throw new BadRequestException(`Sum of component weights must equal 100% (currently ${totalWeight}%)`);
    }

    const id = `struct_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const structure = {
      id,
      tenantId,
      campusId: dto.campusId || null,
      name: dto.name,
      code: dto.code || dto.name.toUpperCase().replace(/\s+/g, '_'),
      description: dto.description || null,
      components: dto.components,
      totalWeight,
      isDefault: dto.isDefault ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (structure.isDefault && this.prisma.memoryStore.assessmentStructures) {
      for (const [sId, s] of this.prisma.memoryStore.assessmentStructures.entries()) {
        if (s.tenantId === tenantId) {
          s.isDefault = false;
          this.prisma.memoryStore.assessmentStructures.set(sId, s);
        }
      }
    }

    if (!this.prisma.memoryStore.assessmentStructures) {
      this.prisma.memoryStore.assessmentStructures = new Map();
    }
    this.prisma.memoryStore.assessmentStructures.set(id, structure);
    return structure;
  }

  async updateAssessmentStructure(tenantId: string, id: string, dto: UpdateAssessmentStructureDto) {
    const struct = await this.getAssessmentStructure(tenantId, id);
    if (dto.components) {
      const totalWeight = dto.components.reduce((sum, c) => sum + (c.weight || 0), 0);
      if (Math.round(totalWeight) !== 100) {
        throw new BadRequestException(`Sum of component weights must equal 100% (currently ${totalWeight}%)`);
      }
      struct.components = dto.components;
      struct.totalWeight = totalWeight;
    }
    if (dto.name) struct.name = dto.name;
    if (dto.code) struct.code = dto.code;
    if (dto.description !== undefined) struct.description = dto.description;
    if (dto.isDefault !== undefined) struct.isDefault = dto.isDefault;
    struct.updatedAt = new Date();

    this.prisma.memoryStore.assessmentStructures.set(id, struct);
    return struct;
  }

  // --- Assessment Evaluation & Preview ---
  async evaluateScore(tenantId: string, dto: EvaluateAssessmentDto) {
    let components: AssessmentComponentDto[] = dto.components || [];
    if (components.length === 0 && dto.assessmentStructureId) {
      const struct = await this.getAssessmentStructure(tenantId, dto.assessmentStructureId);
      components = struct.components;
    }
    if (components.length === 0) {
      components = this.getDefaultAssessmentStructure(tenantId).components;
    }

    return WeightedAssessmentCalculator.evaluate(
      components,
      dto.componentScores,
      dto.gradingScaleRules || DEFAULT_GRADING_RULES,
    );
  }

  // --- Weighted Score Entry ---
  async enterWeightedScore(tenantId: string, userId: string, dto: EnterWeightedScoreDto) {
    let struct = dto.assessmentStructureId
      ? await this.getAssessmentStructure(tenantId, dto.assessmentStructureId)
      : this.getDefaultAssessmentStructure(tenantId);

    const evaluation = WeightedAssessmentCalculator.evaluate(
      struct.components,
      dto.componentScores,
      DEFAULT_GRADING_RULES,
    );

    // Look for existing result record
    let existingId: string | undefined;
    for (const [resId, r] of this.prisma.memoryStore.results.entries()) {
      if (
        r.tenantId === tenantId &&
        r.examinationId === dto.examinationId &&
        r.studentId === dto.studentId &&
        r.subjectId === dto.subjectId
      ) {
        existingId = resId;
        break;
      }
    }

    const id = existingId || `res_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const result = {
      id,
      tenantId,
      examinationId: dto.examinationId,
      studentId: dto.studentId,
      subjectId: dto.subjectId,
      classId: dto.classId || null,
      assessmentStructureId: struct.id,
      marksObtained: evaluation.totalWeightedScore,
      maxMarks: evaluation.maxMarks,
      grade: evaluation.grade,
      gradePoint: evaluation.gradePoint,
      remarks: dto.remarks || evaluation.remarks,
      componentScores: dto.componentScores,
      componentBreakdown: evaluation.componentBreakdown,
      isApproved: false,
      isPublished: false,
      enteredByUserId: userId,
      createdAt: existingId ? this.prisma.memoryStore.results.get(existingId).createdAt : new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.results.set(id, result);
    return { ...result, evaluation };
  }

  async bulkEnterWeightedScores(tenantId: string, userId: string, dto: BulkEnterWeightedScoresDto) {
    const results: any[] = [];
    for (const entry of dto.entries) {
      const res = await this.enterWeightedScore(tenantId, userId, {
        examinationId: dto.examinationId,
        subjectId: dto.subjectId,
        studentId: entry.studentId,
        classId: dto.classId,
        assessmentStructureId: dto.assessmentStructureId,
        componentScores: entry.componentScores,
        remarks: entry.remarks,
      });
      results.push(res);
    }
    return {
      success: true,
      count: results.length,
      examinationId: dto.examinationId,
      subjectId: dto.subjectId,
      results,
    };
  }

  // --- Legacy / Raw Marks Entry (Backward Compatibility) ---
  async enterMarks(
    tenantId: string,
    userId: string,
    data: {
      examinationId: string;
      studentId: string;
      subjectId: string;
      classId?: string;
      marksObtained: number;
      maxMarks?: number;
      remarks?: string;
    },
  ) {
    const maxMarks = data.maxMarks || 100;
    const percentage = (data.marksObtained / maxMarks) * 100;
    const gradeInfo = WeightedAssessmentCalculator.deriveGrade(percentage);

    const id = `res_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const result = {
      id,
      tenantId,
      examinationId: data.examinationId,
      studentId: data.studentId,
      subjectId: data.subjectId,
      classId: data.classId || null,
      marksObtained: data.marksObtained,
      maxMarks,
      grade: gradeInfo.grade,
      gradePoint: gradeInfo.gradePoint,
      remarks: data.remarks || gradeInfo.remark,
      componentScores: { EXAM: data.marksObtained },
      isApproved: false,
      isPublished: false,
      enteredByUserId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.results.set(id, result);
    return result;
  }

  async getResults(
    tenantId: string,
    filters: { examinationId?: string; studentId?: string; classId?: string; subjectId?: string },
  ) {
    let results = Array.from(this.prisma.memoryStore.results.values()).filter(
      (r) => r.tenantId === tenantId,
    );

    if (filters.examinationId) results = results.filter((r) => r.examinationId === filters.examinationId);
    if (filters.studentId) results = results.filter((r) => r.studentId === filters.studentId);
    if (filters.classId) results = results.filter((r) => r.classId === filters.classId);
    if (filters.subjectId) results = results.filter((r) => r.subjectId === filters.subjectId);

    return results;
  }

  async getReportCard(tenantId: string, studentId: string, examinationId: string) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student record not found');
    }

    const exam = this.prisma.memoryStore.examinations.get(examinationId);
    const results = Array.from(this.prisma.memoryStore.results.values()).filter(
      (r) => r.tenantId === tenantId && r.studentId === studentId && r.examinationId === examinationId,
    );

    const totalMarks = results.reduce((acc, r) => acc + r.marksObtained, 0);
    const maxMarks = results.reduce((acc, r) => acc + r.maxMarks, 0);
    const percentage = maxMarks > 0 ? (totalMarks / maxMarks) * 100 : 0;
    const totalGpa = results.reduce((acc, r) => acc + (r.gradePoint || 0), 0);
    const averageGpa = results.length > 0 ? Number((totalGpa / results.length).toFixed(2)) : 0;

    return {
      student,
      examination: exam,
      results,
      summary: {
        totalSubjects: results.length,
        totalMarks: Number(totalMarks.toFixed(2)),
        maxMarks,
        percentage: Number(percentage.toFixed(2)),
        gpa: averageGpa,
        status: percentage >= 50 ? 'PASS' : 'FAIL',
      },
    };
  }

  async approveResults(tenantId: string, examinationId: string, approvedByUserId: string, classId?: string) {
    let count = 0;
    for (const [id, res] of this.prisma.memoryStore.results.entries()) {
      if (res.tenantId === tenantId && res.examinationId === examinationId) {
        if (!classId || res.classId === classId) {
          res.isApproved = true;
          res.approvedAt = new Date();
          res.approvedByUserId = approvedByUserId;
          this.prisma.memoryStore.results.set(id, res);
          count++;
        }
      }
    }
    return { success: true, count, message: `${count} results approved successfully` };
  }

  async publishResults(tenantId: string, examinationId: string, classId?: string) {
    let count = 0;
    for (const [id, res] of this.prisma.memoryStore.results.entries()) {
      if (res.tenantId === tenantId && res.examinationId === examinationId) {
        if (!classId || res.classId === classId) {
          res.isPublished = true;
          res.publishedAt = new Date();
          this.prisma.memoryStore.results.set(id, res);
          count++;
        }
      }
    }
    return { success: true, count, message: `${count} results published and visible to parents/students` };
  }

  async getPrintableReportCard(tenantId: string, studentId: string, examinationId: string) {
    const report = await this.getReportCard(tenantId, studentId, examinationId);
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    const cls = report.student.currentClassId
      ? this.prisma.memoryStore.classes.get(report.student.currentClassId)
      : null;

    return {
      template: 'STANDARD_WEIGHTED_TRANSCRIPT_V1',
      schoolInfo: {
        schoolName: tenant?.name || 'School Name',
        schoolSlug: tenant?.slug || '',
        currency: tenant?.currency || 'USD',
      },
      student: {
        id: report.student.id,
        fullName: `${report.student.firstName} ${report.student.lastName}`,
        admissionNumber: report.student.admissionNumber,
        gender: report.student.gender,
        className: cls?.name || 'Class',
      },
      examination: {
        id: report.examination?.id || examinationId,
        name: report.examination?.name || 'Term Examination',
      },
      grades: report.results.map((r: any) => {
        const subject = this.prisma.memoryStore.subjects.get(r.subjectId);
        return {
          subjectName: subject?.name || 'Subject',
          subjectCode: subject?.code || '',
          score: r.marksObtained,
          maxScore: r.maxMarks,
          grade: r.grade,
          gradePoint: r.gradePoint,
          componentScores: r.componentScores || {},
          componentBreakdown: r.componentBreakdown || [],
          remarks: r.remarks || 'Satisfactory',
        };
      }),
      summary: report.summary,
      signatureLine: {
        principal: 'Approved & Signed by Principal',
        date: new Date().toLocaleDateString(),
      },
      printableAt: new Date().toISOString(),
    };
  }

  private getDefaultAssessmentStructure(tenantId: string) {
    return {
      id: 'struct_default_standard',
      tenantId,
      campusId: null,
      name: 'Standard Secondary Continuous Assessment (40/60)',
      code: 'CA_40_60',
      description: 'Continuous Assessment 1 (10%), CA 2 (10%), Midterm (20%), Final Exam (60%)',
      totalWeight: 100,
      isDefault: true,
      components: [
        { code: 'CA1', name: 'Continuous Assessment 1', maxScore: 20, weight: 10 },
        { code: 'CA2', name: 'Continuous Assessment 2', maxScore: 20, weight: 10 },
        { code: 'MIDTERM', name: 'Mid-Term Test', maxScore: 40, weight: 20 },
        { code: 'EXAM', name: 'Terminal Examination', maxScore: 100, weight: 60 },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
