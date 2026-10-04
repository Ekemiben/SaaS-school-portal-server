import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import {
  CreateAssessmentStructureDto,
  UpdateAssessmentStructureDto,
  EnterWeightedScoreDto,
  BulkEnterWeightedScoresDto,
  EvaluateAssessmentDto,
  AssessmentComponentDto,
  GradingRuleDto,
} from './dto/assessment.dto.js';
import {
  WeightedAssessmentCalculator,
  DEFAULT_GRADING_RULES,
} from './calculator/weighted-assessment-calculator.js';

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- Dynamic Grading Rules Resolution ---
  async resolveGradingRules(tenantId: string): Promise<GradingRuleDto[]> {
    const dbScales = await this.prisma.gradingScale.findMany({
      where: { tenantId },
      orderBy: { minScore: 'desc' },
    });

    if (dbScales.length > 0) {
      return dbScales.map((s) => ({
        grade: s.grade,
        minScore: s.minScore,
        maxScore: s.maxScore,
        gradePoint: s.gradePoint,
        remark: s.description || s.grade,
      }));
    }

    return DEFAULT_GRADING_RULES;
  }

  // --- Assessment Structures ---
  async listAssessmentStructures(tenantId: string, campusId?: string) {
    const dbStructures = await this.prisma.assessmentStructure.findMany({
      where: {
        tenantId,
        ...(campusId ? { campusId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (dbStructures.length > 0) {
      return dbStructures.map((s) => ({
        id: s.id,
        tenantId: s.tenantId,
        campusId: s.campusId,
        name: s.name,
        code: s.code || s.name.toUpperCase().replace(/\s+/g, '_'),
        description: s.description,
        components: s.components as any,
        totalWeight: s.totalWeight,
        isDefault: s.isDefault,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
    }

    return [this.getDefaultAssessmentStructure(tenantId)];
  }

  async getAssessmentStructure(tenantId: string, id: string) {
    if (id === 'default' || id === 'struct_default_standard') {
      return this.getDefaultAssessmentStructure(tenantId);
    }

    const s = await this.prisma.assessmentStructure.findFirst({
      where: { id, tenantId },
    });
    if (!s) {
      throw new NotFoundException('Assessment structure not found');
    }

    return {
      id: s.id,
      tenantId: s.tenantId,
      campusId: s.campusId,
      name: s.name,
      code: s.code,
      description: s.description,
      components: s.components as any,
      totalWeight: s.totalWeight,
      isDefault: s.isDefault,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  async createAssessmentStructure(tenantId: string, dto: CreateAssessmentStructureDto) {
    const totalWeight = dto.components.reduce((sum, c) => sum + (c.weight || 0), 0);
    if (Math.round(totalWeight) !== 100) {
      throw new BadRequestException(`Sum of component weights must equal 100% (currently ${totalWeight}%)`);
    }

    const id = `struct_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const isDefault = dto.isDefault ?? false;

    if (isDefault) {
      await this.prisma.assessmentStructure.updateMany({
        where: { tenantId },
        data: { isDefault: false },
      });
    }

    const code = dto.code || dto.name.toUpperCase().replace(/\s+/g, '_');

    const created = await this.prisma.assessmentStructure.create({
      data: {
        id,
        tenantId,
        campusId: dto.campusId || null,
        name: dto.name,
        code,
        description: dto.description || null,
        components: dto.components as any,
        totalWeight,
        isDefault,
      },
    });

    this.logger.log(`Created AssessmentStructure ${id} in PostgreSQL`);
    return {
      ...created,
      components: created.components as any,
    };
  }

  async updateAssessmentStructure(tenantId: string, id: string, dto: UpdateAssessmentStructureDto) {
    const existing = await this.prisma.assessmentStructure.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Assessment structure not found');
    }

    let totalWeight: number | undefined;
    if (dto.components) {
      totalWeight = dto.components.reduce((sum, c) => sum + (c.weight || 0), 0);
      if (Math.round(totalWeight) !== 100) {
        throw new BadRequestException(`Sum of component weights must equal 100% (currently ${totalWeight}%)`);
      }
    }

    if (dto.isDefault) {
      await this.prisma.assessmentStructure.updateMany({
        where: { tenantId },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.assessmentStructure.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.code ? { code: dto.code } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.components ? { components: dto.components as any } : {}),
        ...(totalWeight !== undefined ? { totalWeight } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
    });

    return {
      ...updated,
      components: updated.components as any,
    };
  }

  async deleteAssessmentStructure(tenantId: string, id: string) {
    const existing = await this.prisma.assessmentStructure.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Assessment structure not found');
    }

    await this.prisma.assessmentStructure.delete({
      where: { id },
    });

    return { success: true, message: 'Assessment rubric deleted successfully' };
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

    const gradingRules = dto.gradingScaleRules || (await this.resolveGradingRules(tenantId));

    return WeightedAssessmentCalculator.evaluate(
      components,
      dto.componentScores,
      gradingRules,
    );
  }

  // --- Weighted Score Entry ---
  async enterWeightedScore(tenantId: string, userId: string, dto: EnterWeightedScoreDto) {
    const struct = dto.assessmentStructureId
      ? await this.getAssessmentStructure(tenantId, dto.assessmentStructureId)
      : this.getDefaultAssessmentStructure(tenantId);

    const gradingRules = await this.resolveGradingRules(tenantId);

    const rawScores = dto.componentScores || (dto as any).scores || {};
    const normalizedScores: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawScores)) {
      normalizedScores[k.toUpperCase()] = Number(v) || 0;
      normalizedScores[k] = Number(v) || 0;
    }

    const evaluation = WeightedAssessmentCalculator.evaluate(
      struct.components,
      normalizedScores,
      gradingRules,
    );

    const resultId = `res_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const savedResult = await this.prisma.result.upsert({
      where: {
        tenantId_examinationId_studentId_subjectId: {
          tenantId,
          examinationId: dto.examinationId,
          studentId: dto.studentId,
          subjectId: dto.subjectId,
        },
      },
      update: {
        classId: dto.classId || null,
        assessmentStructureId: struct.id.startsWith('struct_default') ? null : struct.id,
        marksObtained: evaluation.totalWeightedScore,
        maxMarks: evaluation.maxMarks,
        grade: evaluation.grade,
        gradePoint: evaluation.gradePoint,
        remarks: dto.remarks || evaluation.remarks,
        componentScores: dto.componentScores as any,
        enteredByUserId: userId,
      },
      create: {
        id: resultId,
        tenantId,
        examinationId: dto.examinationId,
        studentId: dto.studentId,
        subjectId: dto.subjectId,
        classId: dto.classId || null,
        assessmentStructureId: struct.id.startsWith('struct_default') ? null : struct.id,
        marksObtained: evaluation.totalWeightedScore,
        maxMarks: evaluation.maxMarks,
        grade: evaluation.grade,
        gradePoint: evaluation.gradePoint,
        remarks: dto.remarks || evaluation.remarks,
        componentScores: dto.componentScores as any,
        enteredByUserId: userId,
      },
    });

    this.logger.log(`Persisted result for student ${dto.studentId} in exam ${dto.examinationId} to PostgreSQL`);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: userId || null,
        action: 'RESULT_SCORE_RECORDED',
        resourceType: 'Result',
        resourceId: savedResult.id,
        afterData: {
          studentId: dto.studentId,
          subjectId: dto.subjectId,
          examinationId: dto.examinationId,
          marksObtained: evaluation.totalWeightedScore,
          grade: evaluation.grade,
          componentScores: dto.componentScores,
        } as any,
      },
    });

    return {
      ...savedResult,
      componentBreakdown: evaluation.componentBreakdown,
      evaluation,
    };
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

  // --- Legacy / Raw Marks Entry ---
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
    const gradingRules = await this.resolveGradingRules(tenantId);
    const gradeInfo = WeightedAssessmentCalculator.deriveGrade(percentage, gradingRules);

    const id = `res_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const saved = await this.prisma.result.upsert({
      where: {
        tenantId_examinationId_studentId_subjectId: {
          tenantId,
          examinationId: data.examinationId,
          studentId: data.studentId,
          subjectId: data.subjectId,
        },
      },
      update: {
        classId: data.classId || null,
        marksObtained: data.marksObtained,
        maxMarks,
        grade: gradeInfo.grade,
        gradePoint: gradeInfo.gradePoint,
        remarks: data.remarks || gradeInfo.remark,
        componentScores: { EXAM: data.marksObtained } as any,
        enteredByUserId: userId,
      },
      create: {
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
        componentScores: { EXAM: data.marksObtained } as any,
        enteredByUserId: userId,
      },
    });

    return saved;
  }

  async getResults(
    tenantId: string,
    filters: { examinationId?: string; studentId?: string; classId?: string; subjectId?: string },
  ) {
    const dbResults = await this.prisma.result.findMany({
      where: {
        tenantId,
        ...(filters.examinationId ? { examinationId: filters.examinationId } : {}),
        ...(filters.studentId ? { studentId: filters.studentId } : {}),
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      },
      include: {
        student: true,
        subject: true,
        examination: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return dbResults.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      examinationId: r.examinationId,
      studentId: r.studentId,
      studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : 'Student',
      admissionNumber: r.student?.admissionNumber || '',
      subjectId: r.subjectId,
      subjectName: r.subject?.name || 'Subject',
      subjectCode: r.subject?.code || '',
      classId: r.classId,
      marksObtained: r.marksObtained,
      maxMarks: r.maxMarks,
      grade: r.grade,
      gradePoint: r.gradePoint,
      remarks: r.remarks,
      componentScores: r.componentScores as any,
      isApproved: r.isApproved,
      isPublished: r.isPublished,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getReportCard(tenantId: string, studentId: string, examinationId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      include: {
        campus: true,
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { class: true },
          take: 1,
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student record not found');
    }

    const exam = await this.prisma.examination.findFirst({
      where: { id: examinationId, tenantId },
      include: { academicYear: true, term: true },
    });

    if (!exam) {
      throw new NotFoundException('Examination record not found');
    }

    const dbResults = await this.prisma.result.findMany({
      where: { tenantId, studentId, examinationId },
      include: { subject: true },
    });

    const results = dbResults.map((r) => ({
      ...r,
      subjectName: r.subject?.name || 'Subject',
      subjectCode: r.subject?.code || '',
    }));

    const totalMarks = results.reduce((acc, r) => acc + (r.marksObtained || 0), 0);
    const maxMarks = results.reduce((acc, r) => acc + (r.maxMarks || 0), 0);
    const percentage = maxMarks > 0 ? (totalMarks / maxMarks) * 100 : 0;
    const totalGpa = results.reduce((acc, r) => acc + (r.gradePoint || 0), 0);
    const averageGpa = results.length > 0 ? Number((totalGpa / results.length).toFixed(2)) : 0;

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNumber: student.admissionNumber,
        gender: student.gender,
        className: student.enrollments?.[0]?.class?.name || 'Class',
      },
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
    const updateRes = await this.prisma.result.updateMany({
      where: {
        tenantId,
        examinationId,
        ...(classId ? { classId } : {}),
      },
      data: {
        isApproved: true,
        approvedAt: new Date(),
        approvedByUserId,
      },
    });

    this.logger.log(`Approved ${updateRes.count} results in DB`);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: approvedByUserId || null,
        action: 'RESULTS_APPROVED',
        resourceType: 'Examination',
        resourceId: examinationId,
        afterData: {
          examinationId,
          classId: classId || 'ALL',
          approvedCount: updateRes.count,
          approvedAt: new Date(),
        } as any,
      },
    });

    return { success: true, count: updateRes.count, message: `${updateRes.count} results approved successfully` };
  }

  async publishResults(tenantId: string, examinationId: string, classId?: string) {
    const updateRes = await this.prisma.result.updateMany({
      where: {
        tenantId,
        examinationId,
        ...(classId ? { classId } : {}),
      },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    this.logger.log(`Published ${updateRes.count} results in DB`);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: null,
        action: 'RESULTS_PUBLISHED',
        resourceType: 'Examination',
        resourceId: examinationId,
        afterData: {
          examinationId,
          classId: classId || 'ALL',
          publishedCount: updateRes.count,
          publishedAt: new Date(),
        } as any,
      },
    });

    return { success: true, count: updateRes.count, message: `${updateRes.count} results published and visible to parents/students` };
  }

  async getPrintableReportCard(tenantId: string, studentId: string, examinationId: string) {
    const report = await this.getReportCard(tenantId, studentId, examinationId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

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
        className: report.student.className,
      },
      examination: {
        id: report.examination?.id || examinationId,
        name: report.examination?.name || 'Term Examination',
      },
      grades: report.results.map((r: any) => ({
        subjectName: r.subjectName || r.subject?.name || 'Subject',
        subjectCode: r.subjectCode || r.subject?.code || '',
        score: r.marksObtained,
        maxScore: r.maxMarks,
        grade: r.grade,
        gradePoint: r.gradePoint,
        componentScores: r.componentScores || {},
        componentBreakdown: r.componentScores || {},
        remarks: r.remarks || 'Satisfactory',
      })),
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
