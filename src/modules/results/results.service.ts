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
}
