import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import {
  CalculateClassSummariesDto,
  ClassBroadsheetResult,
  StudentSummaryResult,
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
    let cls: any = null;
    let exam: any = null;
    let students: any[] = [];
    let results: any[] = [];

    if (this.prisma.isDbConnected) {
      try {
        cls = await this.prisma.class.findFirst({
          where: { id: dto.classId, tenantId },
        });
        exam = await this.prisma.examination.findFirst({
          where: { id: dto.examinationId, tenantId },
        });

        if (cls && exam) {
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

          students = dbStudents.map((s) => ({
            id: s.id,
            name: `${s.firstName} ${s.lastName}`.trim(),
            admissionNumber: s.admissionNumber,
          }));

          results = dbStudents.flatMap((s) =>
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
        }
      } catch (err: any) {
        this.logger.warn(`Could not load class/results from DB: ${err.message}`);
      }
    }

    if (!cls) {
      cls = this.prisma.memoryStore.classes.get(dto.classId);
    }
    if (!cls || cls.tenantId !== tenantId) {
      throw new NotFoundException('Class not found');
    }

    if (!exam) {
      exam = this.prisma.memoryStore.examinations.get(dto.examinationId);
    }
    if (!exam || exam.tenantId !== tenantId) {
      throw new NotFoundException('Examination not found');
    }

    if (students.length === 0) {
      students = Array.from(this.prisma.memoryStore.students.values())
        .filter((s: any) => s.tenantId === tenantId && (s.currentClassId === dto.classId || s.classId === dto.classId))
        .map((s: any) => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          admissionNumber: s.admissionNumber,
        }));
    }

    if (results.length === 0) {
      const studentIds = new Set(students.map((s) => s.id));
      results = Array.from(this.prisma.memoryStore.results.values())
        .filter(
          (r: any) =>
            r.tenantId === tenantId &&
            r.examinationId === dto.examinationId &&
            studentIds.has(r.studentId),
        )
        .map((r: any) => {
          const subject = this.prisma.memoryStore.subjects.get(r.subjectId);
          return {
            studentId: r.studentId,
            subjectId: r.subjectId,
            subjectName: subject?.name || 'Subject',
            subjectCode: subject?.code || '',
            marksObtained: r.marksObtained,
            maxMarks: r.maxMarks,
            grade: r.grade,
            gradePoint: r.gradePoint,
          };
        });
    }

    // Run pure broadsheet calculation engine
    const broadsheet = AcademicSummaryCalculator.generateClassBroadsheet({
      classId: dto.classId,
      className: cls.name,
      examinationId: dto.examinationId,
      examinationName: exam.name || exam.title || 'Terminal Examination',
      students,
      results,
      creditUnits: dto.creditUnits,
    });

    if (!this.prisma.memoryStore.academicSummaries) {
      this.prisma.memoryStore.academicSummaries = new Map();
    }

    for (const studentSummary of broadsheet.students) {
      let pastSummaries: any[] = [];
      if (this.prisma.isDbConnected) {
        try {
          pastSummaries = await this.prisma.academicSummary.findMany({
            where: {
              tenantId,
              studentId: studentSummary.studentId,
              examinationId: { not: dto.examinationId },
            },
          });
        } catch {}
      }

      if (pastSummaries.length === 0) {
        pastSummaries = Array.from(this.prisma.memoryStore.academicSummaries.values()).filter(
          (a: any) =>
            a.tenantId === tenantId &&
            a.studentId === studentSummary.studentId &&
            a.examinationId !== dto.examinationId,
        );
      }

      const allTerms = [
        ...pastSummaries.map((p: any) => ({ gpa: p.gpa, totalCredits: p.totalSubjects })),
        { gpa: studentSummary.gpa, totalCredits: studentSummary.totalSubjects },
      ];

      const cgpa = AcademicSummaryCalculator.calculateCumulativeGpa(allTerms);
      studentSummary.cgpa = cgpa;

      const summaryId = `summary_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

      if (this.prisma.isDbConnected) {
        try {
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
        } catch (err: any) {
          this.logger.warn(`Could not persist academic summary to DB: ${err.message}`);
        }
      }

      // Keep in memory
      let memSummaryId: string | undefined;
      for (const [id, s] of this.prisma.memoryStore.academicSummaries.entries()) {
        if (
          s.tenantId === tenantId &&
          s.studentId === studentSummary.studentId &&
          s.classId === dto.classId &&
          s.examinationId === dto.examinationId
        ) {
          memSummaryId = id;
          break;
        }
      }

      const id = memSummaryId || summaryId;
      const summaryRecord = {
        id,
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
        subjectSummaries: studentSummary.subjects,
        status: 'CALCULATED',
        calculatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.prisma.memoryStore.academicSummaries.set(id, summaryRecord);
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
    if (this.prisma.isDbConnected) {
      try {
        const dbSummary = await this.prisma.academicSummary.findFirst({
          where: {
            tenantId,
            studentId,
            ...(examinationId ? { examinationId } : {}),
          },
          orderBy: { calculatedAt: 'desc' },
        });

        if (dbSummary) {
          return dbSummary;
        }
      } catch (err: any) {
        this.logger.warn(`Could not get academic summary from DB: ${err.message}`);
      }
    }

    let summaries = Array.from(this.prisma.memoryStore.academicSummaries?.values() || []).filter(
      (s: any) => s.tenantId === tenantId && s.studentId === studentId,
    );

    if (examinationId) {
      summaries = summaries.filter((s: any) => s.examinationId === examinationId);
    }

    return summaries[0] || null;
  }

  /**
   * Retrieves full academic history and cumulative GPA trend for a student across all sessions.
   */
  async getStudentAcademicHistory(tenantId: string, studentId: string) {
    let student: any = null;
    let summaries: any[] = [];

    if (this.prisma.isDbConnected) {
      try {
        student = await this.prisma.student.findFirst({
          where: { id: studentId, tenantId },
        });
        summaries = await this.prisma.academicSummary.findMany({
          where: { tenantId, studentId },
          include: { class: true },
          orderBy: { calculatedAt: 'asc' },
        });
      } catch (err: any) {
        this.logger.warn(`Could not get student academic history from DB: ${err.message}`);
      }
    }

    if (!student) {
      student = this.prisma.memoryStore.students.get(studentId);
    }
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student not found');
    }

    if (summaries.length === 0) {
      summaries = Array.from(this.prisma.memoryStore.academicSummaries?.values() || [])
        .filter((s: any) => s.tenantId === tenantId && s.studentId === studentId)
        .sort((a: any, b: any) => new Date(a.calculatedAt).getTime() - new Date(b.calculatedAt).getTime());
    }

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
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);

    const summaries = Array.from(this.prisma.memoryStore.academicSummaries?.values() || []).filter(
      (s: any) => s.tenantId === tenantId && s.studentId === studentId,
    );

    const termsWithCourses = summaries.map((s: any) => ({
      termName: 'Academic Term',
      termGpa: s.gpa,
      cgpa: s.cgpa,
      classRank: `${s.classRank} of ${s.totalStudentsInClass}`,
      courses: s.subjectSummaries || [],
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
