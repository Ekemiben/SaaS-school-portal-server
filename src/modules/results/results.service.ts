import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async getResults(
    tenantId: string,
    filters: { examinationId?: string; studentId?: string; classId?: string },
  ) {
    let results = Array.from(this.prisma.memoryStore.results.values()).filter(
      (r) => r.tenantId === tenantId,
    );

    if (filters.examinationId) {
      results = results.filter((r) => r.examinationId === filters.examinationId);
    }
    if (filters.studentId) {
      results = results.filter((r) => r.studentId === filters.studentId);
    }

    return results;
  }

  async enterMarks(
    tenantId: string,
    userId: string,
    data: {
      examinationId: string;
      studentId: string;
      subjectId: string;
      marksObtained: number;
      maxMarks?: number;
      remarks?: string;
    },
  ) {
    const maxMarks = data.maxMarks || 100;
    const percentage = (data.marksObtained / maxMarks) * 100;

    let grade = 'F';
    if (percentage >= 80) grade = 'A';
    else if (percentage >= 70) grade = 'B';
    else if (percentage >= 60) grade = 'C';
    else if (percentage >= 50) grade = 'D';
    else if (percentage >= 40) grade = 'E';

    const id = `res_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const result = {
      id,
      tenantId,
      examinationId: data.examinationId,
      studentId: data.studentId,
      subjectId: data.subjectId,
      marksObtained: data.marksObtained,
      maxMarks,
      grade,
      remarks: data.remarks || null,
      isPublished: false,
      enteredByUserId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.results.set(id, result);
    return result;
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

    return {
      student,
      examination: exam,
      results,
      summary: {
        totalMarks,
        maxMarks,
        percentage: Number(percentage.toFixed(2)),
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
      template: 'STANDARD_TRANSCRIPT_V1',
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
}
