import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { QueueService } from '../../jobs/queue.service.js';
import { QUEUES, JOB_TYPES } from '../../jobs/queue.constants.js';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async getExecutiveDashboard(tenantId: string) {
    if (this.prisma.isDbConnected) {
      const [
        totalStudents,
        activeStudents,
        totalCampuses,
        totalTeachers,
        totalClasses,
        invoicesAggregate,
        paymentsAggregate,
        campusesList,
      ] = await Promise.all([
        this.prisma.student.count({ where: { tenantId } }),
        this.prisma.student.count({ where: { tenantId, status: 'ACTIVE' } }),
        this.prisma.campus.count({ where: { tenantId } }),
        this.prisma.teacher.count({ where: { tenantId } }),
        this.prisma.class.count({ where: { tenantId } }),
        this.prisma.invoice.aggregate({
          where: { tenantId },
          _sum: { totalAmount: true },
        }),
        this.prisma.payment.aggregate({
          where: { tenantId, status: 'SUCCESSFUL' },
          _sum: { amount: true },
        }),
        this.prisma.campus.findMany({
          where: { tenantId },
          include: { _count: { select: { students: true } } },
        }),
      ]);

      const totalBilled = Number(invoicesAggregate._sum?.totalAmount || 0);
      const totalCollected = Number(paymentsAggregate._sum?.amount || 0);
      const outstandingFees = Math.max(0, totalBilled - totalCollected);

      return {
        metrics: {
          totalStudents,
          activeStudents,
          totalCampuses,
          totalTeachers,
          totalClasses,
          totalBilled,
          totalCollected,
          outstandingFees,
          collectionRate: totalBilled > 0 ? Number(((totalCollected / totalBilled) * 100).toFixed(1)) : 100,
        },
        campuses: campusesList.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          studentCount: c._count.students,
        })),
      };
    }

    const students = Array.from(this.prisma.memoryStore.students.values()).filter(
      (s) => s.tenantId === tenantId,
    );
    const campuses = Array.from(this.prisma.memoryStore.campuses.values()).filter(
      (c) => c.tenantId === tenantId,
    );
    const teachers = Array.from(this.prisma.memoryStore.teachers.values()).filter(
      (t) => t.tenantId === tenantId,
    );
    const classes = Array.from(this.prisma.memoryStore.classes?.values() || []).filter(
      (cl: any) => cl.tenantId === tenantId,
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
        totalClasses: classes.length,
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

  async getFinancialSummary(tenantId: string) {
    if (this.prisma.isDbConnected) {
      const [
        invoicesAggregate,
        paymentsAggregate,
        waiversAggregate,
        invoicesCount,
        paidInvoicesCount,
        pendingInvoicesCount,
        feeStructuresCount,
      ] = await Promise.all([
        this.prisma.invoice.aggregate({ where: { tenantId }, _sum: { totalAmount: true } }),
        this.prisma.payment.aggregate({ where: { tenantId, status: 'SUCCESSFUL' }, _sum: { amount: true } }),
        this.prisma.feeWaiver.aggregate({ where: { tenantId }, _sum: { waiverAmount: true } }),
        this.prisma.invoice.count({ where: { tenantId } }),
        this.prisma.invoice.count({ where: { tenantId, status: 'PAID' } }),
        this.prisma.invoice.count({ where: { tenantId, status: { in: ['PENDING', 'PARTIALLY_PAID'] } } }),
        this.prisma.feeStructure.count({ where: { tenantId } }),
      ]);

      const totalBilled = Number(invoicesAggregate._sum?.totalAmount || 0);
      const totalCollected = Number(paymentsAggregate._sum?.amount || 0);
      const totalWaivers = Number(waiversAggregate._sum?.waiverAmount || 0);
      const outstanding = Math.max(0, totalBilled - totalCollected);

      return {
        totalBilled,
        totalCollected,
        totalWaivers,
        outstanding,
        collectionRate: totalBilled > 0 ? Number(((totalCollected / totalBilled) * 100).toFixed(2)) : 100,
        invoicesCount,
        paidInvoicesCount,
        pendingInvoicesCount,
        feeStructuresCount,
      };
    }

    const invoices = Array.from(this.prisma.memoryStore.invoices.values()).filter(
      (i) => i.tenantId === tenantId,
    );
    const payments = Array.from(this.prisma.memoryStore.payments.values()).filter(
      (p) => p.tenantId === tenantId && p.status === 'SUCCESSFUL',
    );
    const feeStructures = Array.from(this.prisma.memoryStore.feeStructures.values()).filter(
      (f) => f.tenantId === tenantId,
    );
    const waivers = Array.from(this.prisma.memoryStore.feeWaivers.values()).filter(
      (w) => w.tenantId === tenantId,
    );

    const totalBilled = invoices.reduce((sum, i) => sum + i.totalAmount, 0);
    const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalWaivers = waivers.reduce((sum, w) => sum + w.amount, 0);
    const outstanding = Math.max(0, totalBilled - totalCollected);

    return {
      totalBilled,
      totalCollected,
      totalWaivers,
      outstanding,
      collectionRate: totalBilled > 0 ? Number(((totalCollected / totalBilled) * 100).toFixed(2)) : 100,
      invoicesCount: invoices.length,
      paidInvoicesCount: invoices.filter((i) => i.status === 'PAID').length,
      pendingInvoicesCount: invoices.filter((i) => i.status === 'PENDING' || i.status === 'PARTIALLY_PAID').length,
      feeStructuresCount: feeStructures.length,
    };
  }

  async getAcademicSummary(tenantId: string, examinationId?: string) {
    const results = Array.from(this.prisma.memoryStore.results.values()).filter(
      (r) => r.tenantId === tenantId && (!examinationId || r.examinationId === examinationId),
    );

    const total = results.length;
    if (total === 0) {
      return {
        totalResults: 0,
        averageScore: 0,
        passRate: 100,
        gradeDistribution: {},
      };
    }

    const totalScore = results.reduce((sum, r) => sum + (r.marksObtained / r.maxMarks) * 100, 0);
    const passedCount = results.filter((r) => (r.marksObtained / r.maxMarks) * 100 >= 50).length;

    const gradeDistribution: Record<string, number> = {};
    for (const r of results) {
      gradeDistribution[r.grade] = (gradeDistribution[r.grade] || 0) + 1;
    }

    return {
      totalResults: total,
      averageScore: Number((totalScore / total).toFixed(1)),
      passRate: Number(((passedCount / total) * 100).toFixed(1)),
      gradeDistribution,
    };
  }

  async getAttendanceSummary(tenantId: string) {
    if (this.prisma.isDbConnected) {
      const [totalRecords, present, absent] = await Promise.all([
        this.prisma.attendance.count({ where: { tenantId } }),
        this.prisma.attendance.count({ where: { tenantId, status: 'PRESENT' } }),
        this.prisma.attendance.count({ where: { tenantId, status: 'ABSENT' } }),
      ]);

      if (totalRecords === 0) {
        return { totalRecords: 0, presentRate: 100, absentRate: 0 };
      }

      return {
        totalRecords,
        presentRate: Number(((present / totalRecords) * 100).toFixed(1)),
        absentRate: Number(((absent / totalRecords) * 100).toFixed(1)),
      };
    }

    const attendance = Array.from(this.prisma.memoryStore.attendance.values()).filter(
      (a) => a.tenantId === tenantId,
    );

    const total = attendance.length;
    if (total === 0) {
      return { totalRecords: 0, presentRate: 100, absentRate: 0 };
    }

    const present = attendance.filter((a) => a.status === 'PRESENT').length;
    const absent = attendance.filter((a) => a.status === 'ABSENT').length;

    return {
      totalRecords: total,
      presentRate: Number(((present / total) * 100).toFixed(1)),
      absentRate: Number(((absent / total) * 100).toFixed(1)),
    };
  }

  async queueExport(
    tenantId: string,
    userId: string,
    dto: { reportType: 'report-card' | 'fee-summary' | 'attendance-sheet'; campusId?: string; parameters?: any },
  ) {
    const result = await this.queueService.dispatch(
      QUEUES.REPORTS,
      JOB_TYPES.GENERATE_REPORT_CARD,
      {
        tenantId,
        userId,
        campusId: dto.campusId,
        data: {
          reportType: dto.reportType,
          tenantId,
          campusId: dto.campusId,
          parameters: dto.parameters || {},
          requestedByUserId: userId,
        },
      },
    );

    return {
      jobId: result.jobId,
      queue: result.queue,
      status: 'QUEUED',
    };
  }
}
