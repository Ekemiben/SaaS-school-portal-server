import { Injectable, NotFoundException } from '@nestjs/common';
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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes, ranks, and persists academic summaries for an entire class for an examination.
   */
  async calculateClassSummaries(
    tenantId: string,
    dto: CalculateClassSummariesDto,
  ): Promise<ClassBroadsheetResult> {
    const cls = this.prisma.memoryStore.classes.get(dto.classId);
    if (!cls || cls.tenantId !== tenantId) {
      throw new NotFoundException('Class not found');
    }

    const exam = this.prisma.memoryStore.examinations.get(dto.examinationId);
    if (!exam || exam.tenantId !== tenantId) {
      throw new NotFoundException('Examination not found');
    }

    // Get all students enrolled or belonging to this class
    const students = Array.from(this.prisma.memoryStore.students.values())
      .filter((s: any) => s.tenantId === tenantId && (s.currentClassId === dto.classId || s.classId === dto.classId))
      .map((s: any) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        admissionNumber: s.admissionNumber,
      }));

    // Get all results for these students in this examination
    const studentIds = new Set(students.map((s) => s.id));
    const results = Array.from(this.prisma.memoryStore.results.values())
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

    // Run pure broadsheet calculation engine
    const broadsheet = AcademicSummaryCalculator.generateClassBroadsheet({
      classId: dto.classId,
      className: cls.name,
      examinationId: dto.examinationId,
      examinationName: exam.name,
      students,
      results,
      creditUnits: dto.creditUnits,
    });

    // Compute CGPA for each student by looking up past summaries
    if (!this.prisma.memoryStore.academicSummaries) {
      this.prisma.memoryStore.academicSummaries = new Map();
    }

    for (const studentSummary of broadsheet.students) {
      const pastSummaries = Array.from(this.prisma.memoryStore.academicSummaries.values()).filter(
        (a: any) =>
          a.tenantId === tenantId &&
          a.studentId === studentSummary.studentId &&
          a.examinationId !== dto.examinationId,
      );

      const allTerms = [
        ...pastSummaries.map((p: any) => ({ gpa: p.gpa, totalCredits: p.totalSubjects })),
        { gpa: studentSummary.gpa, totalCredits: studentSummary.totalSubjects },
      ];

      const cgpa = AcademicSummaryCalculator.calculateCumulativeGpa(allTerms);
      studentSummary.cgpa = cgpa;

      // Find existing summary record or create new
      let summaryId: string | undefined;
      for (const [id, s] of this.prisma.memoryStore.academicSummaries.entries()) {
        if (
          s.tenantId === tenantId &&
          s.studentId === studentSummary.studentId &&
          s.classId === dto.classId &&
          s.examinationId === dto.examinationId
        ) {
          summaryId = id;
          break;
        }
      }

      const id = summaryId || `summary_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
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
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student not found');
    }

    let summaries = Array.from(this.prisma.memoryStore.academicSummaries?.values() || []).filter(
      (s: any) => s.tenantId === tenantId && s.studentId === studentId,
    );

    if (examinationId) {
      summaries = summaries.filter((s: any) => s.examinationId === examinationId);
    }

    if (summaries.length === 0 && examinationId && student.currentClassId) {
      // Compute on the fly if not cached
      await this.calculateClassSummaries(tenantId, {
        classId: student.currentClassId,
        examinationId,
      });
      summaries = Array.from(this.prisma.memoryStore.academicSummaries?.values() || []).filter(
        (s: any) => s.tenantId === tenantId && s.studentId === studentId && s.examinationId === examinationId,
      );
    }

    return summaries[0] || null;
  }

  /**
   * Retrieves full academic history and cumulative GPA trend for a student across all sessions.
   */
  async getStudentAcademicHistory(tenantId: string, studentId: string) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student not found');
    }

    const summaries = Array.from(this.prisma.memoryStore.academicSummaries?.values() || [])
      .filter((s: any) => s.tenantId === tenantId && s.studentId === studentId)
      .sort((a: any, b: any) => new Date(a.calculatedAt).getTime() - new Date(b.calculatedAt).getTime());

    const termSummaries = summaries.map((s: any) => {
      const exam = this.prisma.memoryStore.examinations?.get(s.examinationId);
      const cls = this.prisma.memoryStore.classes?.get(s.classId);
      return {
        examinationId: s.examinationId,
        examinationName: exam?.name || 'Examination',
        className: cls?.name || 'Class',
        totalMarks: s.totalMarks,
        maxMarks: s.maxMarks,
        percentage: s.percentage,
        gpa: s.gpa,
        cgpa: s.cgpa,
        classRank: s.classRank,
        totalStudents: s.totalStudentsInClass,
        academicStanding: s.academicStanding,
        calculatedAt: s.calculatedAt,
      };
    });

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

    const termsWithCourses = summaries.map((s: any) => {
      const exam = this.prisma.memoryStore.examinations?.get(s.examinationId);
      return {
        termName: exam?.name || 'Academic Term',
        termGpa: s.gpa,
        cgpa: s.cgpa,
        classRank: `${s.classRank} of ${s.totalStudentsInClass}`,
        courses: s.subjectSummaries || [],
      };
    });

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
