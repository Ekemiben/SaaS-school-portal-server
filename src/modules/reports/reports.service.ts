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

  async getFinancialSummary(tenantId: string) {
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

  async getAcademicSummary(tenantId: string, examinationId?: string) {
    const results = await this.prisma.result.findMany({
      where: {
        tenantId,
        ...(examinationId ? { examinationId } : {}),
      },
    });

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
      const g = r.grade || 'N/A';
      gradeDistribution[g] = (gradeDistribution[g] || 0) + 1;
    }

    return {
      totalResults: total,
      averageScore: Number((totalScore / total).toFixed(1)),
      passRate: Number(((passedCount / total) * 100).toFixed(1)),
      gradeDistribution,
    };
  }

  async getAttendanceSummary(tenantId: string) {
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
