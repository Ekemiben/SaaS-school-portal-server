import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import {
  CalculateClassSummariesDto,
  ClassBroadsheetResult,
} from '../dto/academic-summary.dto.js';
import { AcademicSummaryCalculator } from '../calculator/academic-summary-calculator.js';

@Injectable()
export class AcademicSummaryService {
  private readonly logger = new Logger(AcademicSummaryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes, ranks, and persists academic summaries for an entire class for an examination.
   */
  async calculateClassSummaries(
    tenantId: string,
    dto: CalculateClassSummariesDto,
  ): Promise<ClassBroadsheetResult> {
    const cls = await this.prisma.class.findFirst({
      where: { id: dto.classId, tenantId },
    });
    if (!cls) {
      throw new NotFoundException('Class not found');
    }

    const exam = await this.prisma.examination.findFirst({
      where: { id: dto.examinationId, tenantId },
    });
    if (!exam) {
      throw new NotFoundException('Examination not found');
    }

    const dbStudents = await this.prisma.student.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        enrollments: {
          some: { classId: dto.classId, status: 'ACTIVE' },
        },
      },
      include: {
        results: {
          where: { examinationId: dto.examinationId },
          include: { subject: true },
        },
      },
    });

    const students = dbStudents.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
      admissionNumber: s.admissionNumber,
    }));

    const results = dbStudents.flatMap((s) =>
      s.results.map((r) => ({
        studentId: s.id,
        subjectId: r.subjectId,
        subjectName: r.subject?.name || 'Subject',
        subjectCode: r.subject?.code || '',
        marksObtained: r.marksObtained,
        maxMarks: r.maxMarks,
        grade: r.grade || 'F',
        gradePoint: r.gradePoint || 0,
      })),
    );

    // Run pure broadsheet calculation engine
    const broadsheet = AcademicSummaryCalculator.generateClassBroadsheet({
      classId: dto.classId,
      className: cls.name,
      examinationId: dto.examinationId,
      examinationName: exam.name || 'Terminal Examination',
      students,
      results,
      creditUnits: dto.creditUnits,
    });

    for (const studentSummary of broadsheet.students) {
      const pastSummaries = await this.prisma.academicSummary.findMany({
        where: {
          tenantId,
          studentId: studentSummary.studentId,
          examinationId: { not: dto.examinationId },
        },
      });

      const allTerms = [
        ...pastSummaries.map((p: any) => ({ gpa: p.gpa, totalCredits: p.totalSubjects })),
        { gpa: studentSummary.gpa, totalCredits: studentSummary.totalSubjects },
      ];

      const cgpa = AcademicSummaryCalculator.calculateCumulativeGpa(allTerms);
      studentSummary.cgpa = cgpa;

      const summaryId = `summary_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

      await this.prisma.academicSummary.upsert({
        where: {
          tenantId_studentId_classId_examinationId: {
            tenantId,
            studentId: studentSummary.studentId,
            classId: dto.classId,
            examinationId: dto.examinationId,
          },
        },
        update: {
          totalSubjects: studentSummary.totalSubjects,
          totalMarks: studentSummary.totalMarks,
          maxMarks: studentSummary.maxMarks,
          percentage: studentSummary.percentage,
          gpa: studentSummary.gpa,
          cgpa,
          classRank: studentSummary.classRank,
          totalStudentsInClass: studentSummary.totalStudentsInClass,
          classAveragePercentage: studentSummary.classAveragePercentage,
          academicStanding: studentSummary.academicStanding,
          subjectSummaries: studentSummary.subjects as any,
          calculatedAt: new Date(),
        },
        create: {
          id: summaryId,
          tenantId,
          studentId: studentSummary.studentId,
          academicYearId: dto.academicYearId || exam.academicYearId || null,
          termId: dto.termId || exam.termId || null,
          examinationId: dto.examinationId,
          classId: dto.classId,
          totalSubjects: studentSummary.totalSubjects,
          totalMarks: studentSummary.totalMarks,
          maxMarks: studentSummary.maxMarks,
          percentage: studentSummary.percentage,
          gpa: studentSummary.gpa,
          cgpa,
          classRank: studentSummary.classRank,
          totalStudentsInClass: studentSummary.totalStudentsInClass,
          classAveragePercentage: studentSummary.classAveragePercentage,
          academicStanding: studentSummary.academicStanding,
          subjectSummaries: studentSummary.subjects as any,
          status: 'CALCULATED',
          calculatedAt: new Date(),
        },
      });
    }

    return broadsheet;
  }

  /**
   * Retrieves class broadsheet for a specific examination.
   */
  async getClassBroadsheet(
    tenantId: string,
    classId: string,
    examinationId: string,
  ): Promise<ClassBroadsheetResult> {
    return this.calculateClassSummaries(tenantId, { classId, examinationId });
  }

  /**
   * Retrieves a single student's academic summary for an examination or latest.
   */
  async getStudentAcademicSummary(
    tenantId: string,
    studentId: string,
    examinationId?: string,
  ): Promise<any> {
    return await this.prisma.academicSummary.findFirst({
      where: {
        tenantId,
        studentId,
        ...(examinationId ? { examinationId } : {}),
      },
      orderBy: { calculatedAt: 'desc' },
    });
  }

  /**
   * Retrieves full academic history and cumulative GPA trend for a student across all sessions.
   */
  async getStudentAcademicHistory(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const summaries = await this.prisma.academicSummary.findMany({
      where: { tenantId, studentId },
      include: { class: true },
      orderBy: { calculatedAt: 'asc' },
    });

    const termSummaries = summaries.map((s: any) => ({
      examinationId: s.examinationId,
      examinationName: 'Academic Examination',
      className: s.class?.name || 'Class',
      totalMarks: s.totalMarks,
      maxMarks: s.maxMarks,
      percentage: s.percentage,
      gpa: s.gpa,
      cgpa: s.cgpa,
      classRank: s.classRank,
      totalStudents: s.totalStudentsInClass,
      academicStanding: s.academicStanding,
      calculatedAt: s.calculatedAt,
    }));

    const cumulativeGpa = AcademicSummaryCalculator.calculateCumulativeGpa(
      summaries.map((s: any) => ({ gpa: s.gpa, totalCredits: s.totalSubjects })),
    );

    return {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
      },
      cumulativeGpa,
      academicStanding: AcademicSummaryCalculator.deriveAcademicStanding(cumulativeGpa),
      totalTermsRecorded: termSummaries.length,
      history: termSummaries,
    };
  }

  /**
   * Generates a multi-term cumulative official academic transcript.
   */
  async getStudentTranscript(tenantId: string, studentId: string) {
    const history = await this.getStudentAcademicHistory(tenantId, studentId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const summaries = await this.prisma.academicSummary.findMany({
      where: { tenantId, studentId },
      orderBy: { calculatedAt: 'asc' },
    });

    const termsWithCourses = summaries.map((s: any) => ({
      termName: 'Academic Term',
      termGpa: s.gpa,
      cgpa: s.cgpa,
      classRank: `${s.classRank} of ${s.totalStudentsInClass}`,
      courses: (s.subjectSummaries as any) || [],
    }));

    return {
      institution: {
        name: tenant?.name || 'School Name',
        currency: tenant?.currency || 'USD',
      },
      student: history.student,
      overallCgpa: history.cumulativeGpa,
      overallStanding: history.academicStanding,
      terms: termsWithCourses,
      issuedAt: new Date().toISOString(),
      validationCode: `TRN_${randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase()}`,
    };
  }
}
