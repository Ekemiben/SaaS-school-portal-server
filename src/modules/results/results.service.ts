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
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        this.logger.warn(`Could not resolve grading rules from DB: ${err.message}`);
      }
    }

    const memoryScales = Array.from(this.prisma.memoryStore.gradingScales.values()).filter(
      (gs: any) => gs.tenantId === tenantId,
    );
    if (memoryScales.length > 0 && memoryScales[0].bands?.length > 0) {
      return memoryScales[0].bands.map((b: any) => ({
        grade: b.symbol || b.grade || 'A',
        minScore: Number(b.minScore) || 0,
        maxScore: Number(b.maxScore) || 100,
        gradePoint: Number(b.gradePoint) || 0,
        remark: b.remark || b.description || '',
      }));
    }

    return DEFAULT_GRADING_RULES;
  }

  // --- Assessment Structures ---
  async listAssessmentStructures(tenantId: string, campusId?: string) {
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        this.logger.warn(`Failed querying assessment structures from DB: ${err.message}`);
      }
    }

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

    if (this.prisma.isDbConnected) {
      try {
        const s = await this.prisma.assessmentStructure.findFirst({
          where: { id, tenantId },
        });
        if (s) {
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
      } catch (err: any) {
        this.logger.warn(`Could not get assessment structure from DB: ${err.message}`);
      }
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

    if (this.prisma.isDbConnected) {
      try {
        if (structure.isDefault) {
          await this.prisma.assessmentStructure.updateMany({
            where: { tenantId },
            data: { isDefault: false },
          });
        }
        await this.prisma.assessmentStructure.create({
          data: {
            id,
            tenantId,
            campusId: dto.campusId || null,
            name: dto.name,
            code: structure.code,
            description: structure.description,
            components: dto.components as any,
            totalWeight,
            isDefault: structure.isDefault,
          },
        });
        this.logger.log(`Created AssessmentStructure ${id} in PostgreSQL`);
      } catch (err: any) {
        this.logger.warn(`Could not persist assessment structure to DB: ${err.message}`);
      }
    }

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
    let totalWeight: number | undefined;
    if (dto.components) {
      totalWeight = dto.components.reduce((sum, c) => sum + (c.weight || 0), 0);
      if (Math.round(totalWeight) !== 100) {
        throw new BadRequestException(`Sum of component weights must equal 100% (currently ${totalWeight}%)`);
      }
    }

    if (this.prisma.isDbConnected) {
      try {
        if (dto.isDefault) {
          await this.prisma.assessmentStructure.updateMany({
            where: { tenantId },
            data: { isDefault: false },
          });
        }
        await this.prisma.assessmentStructure.updateMany({
          where: { id, tenantId },
          data: {
            ...(dto.name ? { name: dto.name } : {}),
            ...(dto.code ? { code: dto.code } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.components ? { components: dto.components as any } : {}),
            ...(totalWeight !== undefined ? { totalWeight } : {}),
            ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not update assessment structure in DB: ${err.message}`);
      }
    }

    const struct = await this.getAssessmentStructure(tenantId, id);
    if (dto.components && totalWeight !== undefined) {
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

  async deleteAssessmentStructure(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.assessmentStructure.deleteMany({
          where: { id, tenantId },
        });
      } catch (err: any) {
        this.logger.warn(`Could not delete assessment structure from DB: ${err.message}`);
      }
    }

    const struct = await this.getAssessmentStructure(tenantId, id);
    this.prisma.memoryStore.assessmentStructures.delete(id);
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
    let struct = dto.assessmentStructureId
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

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.result.upsert({
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
            resourceId: resultId,
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
      } catch (err: any) {
        this.logger.warn(`Could not persist result to DB: ${err.message}`);
      }
    }

    // Look for existing result record in memory
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

    const id = existingId || resultId;
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

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.result.upsert({
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
      } catch (err: any) {
        this.logger.warn(`Could not save raw mark in DB: ${err.message}`);
      }
    }

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
    if (this.prisma.isDbConnected) {
      try {
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

        if (dbResults.length > 0) {
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
      } catch (err: any) {
        this.logger.warn(`Could not get results from DB: ${err.message}`);
      }
    }

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
    let student: any = null;
    let exam: any = null;
    let results: any[] = [];

    if (this.prisma.isDbConnected) {
      try {
        student = await this.prisma.student.findFirst({
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

        exam = await this.prisma.examination.findFirst({
          where: { id: examinationId, tenantId },
          include: { academicYear: true, term: true },
        });

        const dbResults = await this.prisma.result.findMany({
          where: { tenantId, studentId, examinationId },
          include: { subject: true },
        });

        results = dbResults.map((r) => ({
          ...r,
          subjectName: r.subject?.name || 'Subject',
          subjectCode: r.subject?.code || '',
        }));
      } catch (err: any) {
        this.logger.warn(`Could not get report card from DB: ${err.message}`);
      }
    }

    if (!student) {
      student = this.prisma.memoryStore.students.get(studentId);
    }
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student record not found');
    }

    if (!exam) {
      exam = this.prisma.memoryStore.examinations.get(examinationId);
    }

    if (results.length === 0) {
      results = Array.from(this.prisma.memoryStore.results.values()).filter(
        (r) => r.tenantId === tenantId && r.studentId === studentId && r.examinationId === examinationId,
      );
    }

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
        className: student.enrollments?.[0]?.class?.name || (student as any).className || 'Class',
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
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        this.logger.warn(`Could not approve results in DB: ${err.message}`);
      }
    }

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
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        this.logger.warn(`Could not publish results in DB: ${err.message}`);
      }
    }

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
