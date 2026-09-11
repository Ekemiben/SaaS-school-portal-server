import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getExecutiveDashboard(tenantId: string) {
    const students = Array.from(this.prisma.memoryStore.students.values()).filter(
      (s) => s.tenantId === tenantId,
    );
    const campuses = Array.from(this.prisma.memoryStore.campuses.values()).filter(
      (c) => c.tenantId === tenantId,
    );
    const teachers = Array.from(this.prisma.memoryStore.teachers.values()).filter(
      (t) => t.tenantId === tenantId,
    );
    const invoices = Array.from(this.prisma.memoryStore.invoices.values()).filter(
      (i) => i.tenantId === tenantId,
    );
    const payments = Array.from(this.prisma.memoryStore.payments.values()).filter(
      (p) => p.tenantId === tenantId && p.status === 'SUCCESSFUL',
    );

    const totalBilled = invoices.reduce((sum, i) => sum + i.totalAmount, 0);
    const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
    const outstandingFees = Math.max(0, totalBilled - totalCollected);

    const activeStudents = students.filter((s) => s.status === 'ACTIVE').length;

    return {
      metrics: {
        totalStudents: students.length,
        activeStudents,
        totalCampuses: campuses.length,
        totalTeachers: teachers.length,
        totalBilled,
        totalCollected,
        outstandingFees,
        collectionRate: totalBilled > 0 ? Number(((totalCollected / totalBilled) * 100).toFixed(1)) : 100,
      },
      campuses: campuses.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        studentCount: students.filter((s) => s.campusId === c.id).length,
      })),
    };
  }
}
