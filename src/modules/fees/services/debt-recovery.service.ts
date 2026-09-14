import { Injectable, NotFoundException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { BullmqService } from '../../../jobs/bullmq.service.js';
import { QUEUES, JOB_TYPES } from '../../../jobs/queue.constants.js';
import {
  DefaulterFilterDto,
  SendDebtReminderDto,
  ExamClearancePolicyDto,
  ExamType,
  AgingBucket,
  ReminderChannel,
} from '../dto/debt-recovery.dto.js';
import { AgingAnalysisCalculator } from '../calculator/aging-analysis-calculator.js';
import crypto, { randomUUID } from 'crypto';

@Injectable()
export class DebtRecoveryService {
  private readonly logger = new Logger(DebtRecoveryService.name);
  private readonly examPolicies = new Map<string, ExamClearancePolicyDto>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly bullmqService?: BullmqService,
  ) {}

  // --- Exam Clearance Policy ---
  async getExamClearancePolicy(tenantId: string): Promise<ExamClearancePolicyDto> {
    return (
      this.examPolicies.get(tenantId) || {
        midTermMinPercentagePaid: 50,
        finalExamMinPercentagePaid: 100,
        blockPortalReportCard: true,
        blockExamHallAccess: true,
      }
    );
  }

  async updateExamClearancePolicy(tenantId: string, policy: ExamClearancePolicyDto) {
    this.examPolicies.set(tenantId, policy);
    return policy;
  }

  // --- Defaulters Discovery ---
  async getDefaulters(tenantId: string, filters: DefaulterFilterDto = {}, referenceDate: Date = new Date()) {
    const memory = this.prisma.memoryStore as any;

    let invoices = Array.from(this.prisma.memoryStore.invoices.values()).filter(
      (i: any) =>
        i.tenantId === tenantId &&
        i.status !== 'CANCELLED' &&
        i.status !== 'PAID' &&
        (i.balanceAmount > 0 || (i.totalAmount - (i.paidAmount || 0)) > 0),
    );

    if (filters.campusId) {
      const studentMap = this.prisma.memoryStore.students;
      invoices = invoices.filter((i: any) => studentMap.get(i.studentId)?.campusId === filters.campusId);
    }
    if (filters.academicYearId) invoices = invoices.filter((i: any) => i.academicYearId === filters.academicYearId);
    if (filters.termId) invoices = invoices.filter((i: any) => i.termId === filters.termId);
    if (filters.classId) invoices = invoices.filter((i: any) => i.classId === filters.classId);

    const defaulters: any[] = [];
    const parentStudentMap = new Map<string, any>();
    for (const sp of memory.studentParents?.values() || []) {
      parentStudentMap.set(sp.studentId, sp.parentId);
    }

    for (const inv of invoices) {
      const balance = inv.balanceAmount ?? (inv.totalAmount - (inv.paidAmount || 0));
      if (balance <= 0) continue;
      if (filters.minDebtAmount && balance < filters.minDebtAmount) continue;

      const daysOverdue = AgingAnalysisCalculator.calculateDaysOverdue(inv.dueDate || inv.createdAt, referenceDate);
      const bucket = AgingAnalysisCalculator.categorizeBucket(daysOverdue);

      if (filters.agingBucket && bucket !== filters.agingBucket) continue;

      const student = this.prisma.memoryStore.students.get(inv.studentId);
      const studentClass = inv.classId ? this.prisma.memoryStore.classes.get(inv.classId) : null;
      const parentId = parentStudentMap.get(inv.studentId);
      const parent = parentId ? this.prisma.memoryStore.parents.get(parentId) : null;

      defaulters.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        studentId: inv.studentId,
        studentName: student ? `${student.firstName} ${student.lastName}` : inv.studentName || 'Student',
        admissionNumber: student?.admissionNumber || inv.admissionNumber || 'N/A',
        classId: inv.classId,
        className: studentClass?.name || 'Class',
        parent: parent ? { id: parent.id, name: `${parent.firstName} ${parent.lastName}`, phone: parent.phone, email: parent.email } : null,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount || 0,
        balanceAmount: balance,
        currency: inv.currency || 'NGN',
        dueDate: inv.dueDate,
        daysOverdue,
        agingBucket: bucket,
        lastReminderSentAt: inv.lastReminderSentAt || null,
        reminderCount: inv.reminderCount || 0,
      });
    }

    // Sort by debt amount descending
    return defaulters.sort((a, b) => b.balanceAmount - a.balanceAmount);
  }

  // --- Collection Analytics ---
  async getCollectionAnalytics(tenantId: string, filters: DefaulterFilterDto = {}, referenceDate: Date = new Date()) {
    let invoices = Array.from(this.prisma.memoryStore.invoices.values()).filter(
      (i: any) => i.tenantId === tenantId && i.status !== 'CANCELLED',
    );

    if (filters.campusId) {
      const studentMap = this.prisma.memoryStore.students;
      invoices = invoices.filter((i: any) => studentMap.get(i.studentId)?.campusId === filters.campusId);
    }
    if (filters.academicYearId) invoices = invoices.filter((i: any) => i.academicYearId === filters.academicYearId);
    if (filters.termId) invoices = invoices.filter((i: any) => i.termId === filters.termId);

    const metrics = AgingAnalysisCalculator.calculateMetrics(invoices, referenceDate);
    return {
      tenantId,
      filters,
      metrics,
      generatedAt: new Date().toISOString(),
    };
  }

  // --- Exam Clearance Verification ---
  async checkExamClearance(params: {
    tenantId: string;
    studentId: string;
    academicYearId?: string;
    termId?: string;
    examType: ExamType;
  }) {
    const student = this.prisma.memoryStore.students.get(params.studentId);
    if (!student || student.tenantId !== params.tenantId) {
      throw new NotFoundException('Student record not found');
    }

    const policy = await this.getExamClearancePolicy(params.tenantId);
    const requiredPercentage =
      params.examType === ExamType.MID_TERM
        ? policy.midTermMinPercentagePaid
        : policy.finalExamMinPercentagePaid;

    // Fetch invoices for this student in this term/year
    const invoices = Array.from(this.prisma.memoryStore.invoices.values()).filter(
      (i: any) =>
        i.tenantId === params.tenantId &&
        i.studentId === params.studentId &&
        i.status !== 'CANCELLED' &&
        (!params.academicYearId || i.academicYearId === params.academicYearId) &&
        (!params.termId || i.termId === params.termId),
    );

    const totalBilled = invoices.reduce((acc, i: any) => acc + (i.totalAmount || 0), 0);
    const totalPaid = invoices.reduce((acc, i: any) => acc + (i.paidAmount || 0), 0);
    const totalBalance = Math.max(0, totalBilled - totalPaid);
    const percentagePaid = totalBilled > 0 ? Number(((totalPaid / totalBilled) * 100).toFixed(1)) : 100;

    const isCleared = percentagePaid >= requiredPercentage;
    const requiredAmountForClearance = Math.max(0, Number(((totalBilled * requiredPercentage) / 100 - totalPaid).toFixed(2)));
    const clearanceToken = isCleared
      ? crypto.createHash('sha256').update(`${params.studentId}:${params.examType}:${totalPaid}:${params.tenantId}`).digest('hex').substring(0, 16).toUpperCase()
      : null;

    return {
      student: { id: student.id, fullName: `${student.firstName} ${student.lastName}`, admissionNumber: student.admissionNumber },
      examType: params.examType,
      policy: { requiredPercentage, isExamHallRestricted: !isCleared && policy.blockExamHallAccess, isReportCardBlocked: !isCleared && policy.blockPortalReportCard },
      financials: { totalBilled, totalPaid, outstandingBalance: totalBalance, percentagePaid, requiredAmountForClearance, currency: invoices[0]?.currency || 'NGN' },
      isCleared,
      clearanceCode: clearanceToken ? `CLR-${clearanceToken}` : null,
      evaluatedAt: new Date().toISOString(),
    };
  }

  // --- Automated Debt Recovery Reminders ---
  async sendDebtReminders(tenantId: string, dto: SendDebtReminderDto) {
    const defaulters = await this.getDefaulters(tenantId, {
      campusId: dto.campusId,
      classId: dto.classId,
    });

    const targetDefaulters = dto.invoiceIds?.length
      ? defaulters.filter((d) => dto.invoiceIds!.includes(d.invoiceId))
      : defaulters;

    let remindersDispatched = 0;
    for (const d of targetDefaulters) {
      const inv = this.prisma.memoryStore.invoices.get(d.invoiceId);
      if (inv) {
        inv.lastReminderSentAt = new Date();
        inv.reminderCount = (inv.reminderCount || 0) + 1;
        this.prisma.memoryStore.invoices.set(inv.id, inv);
      }

      if (this.bullmqService && d.parent?.email) {
        const defaultMsg = `Dear ${d.parent.name}, this is a reminder regarding outstanding school fees of ${d.currency} ${d.balanceAmount} for ${d.studentName} (${d.admissionNumber}).`;
        await this.bullmqService.dispatch(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
          tenantId,
          data: {
            recipientEmail: d.parent.email,
            title: `Fee Payment Reminder: ${d.studentName}`,
            message: dto.customMessage || defaultMsg,
            invoiceId: d.invoiceId,
            balanceAmount: d.balanceAmount,
          },
        });
      }
      remindersDispatched++;
    }

    return {
      tenantId,
      totalTargeted: targetDefaulters.length,
      remindersDispatched,
      channel: dto.channel,
      reminderLevel: dto.reminderLevel,
      dispatchedAt: new Date().toISOString(),
    };
  }
}
