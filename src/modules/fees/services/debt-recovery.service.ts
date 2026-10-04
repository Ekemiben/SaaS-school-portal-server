import { Injectable, NotFoundException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { QueueService } from '../../../jobs/queue.service.js';
import { QUEUES, JOB_TYPES } from '../../../jobs/queue.constants.js';
import {
  DefaulterFilterDto,
  SendDebtReminderDto,
  ExamClearancePolicyDto,
  ExamType,
  AgingBucket,
  ReminderChannel,
  ReminderLevel,
} from '../dto/debt-recovery.dto.js';
import { AgingAnalysisCalculator } from '../calculator/aging-analysis-calculator.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { MessageTemplateService } from '../../communications/services/message-template.service.js';
import { CommunicationPolicyService } from '../../communications/services/communication-policy.service.js';
import { CommunicationWalletService } from '../../communications/services/communication-wallet.service.js';
import { CampaignChannel } from '../../communications/dto/campaign.dto.js';
import crypto from 'crypto';

@Injectable()
export class DebtRecoveryService {
  private readonly logger = new Logger(DebtRecoveryService.name);
  private readonly examPolicies = new Map<string, ExamClearancePolicyDto>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly queueService?: QueueService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly templateService?: MessageTemplateService,
    @Optional() private readonly policyService?: CommunicationPolicyService,
    @Optional() private readonly walletService?: CommunicationWalletService,
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
    const whereClause: any = {
      tenantId,
      status: { notIn: ['CANCELLED', 'PAID'] },
      balanceAmount: { gt: 0 },
    };
    if (filters.academicYearId) whereClause.academicYearId = filters.academicYearId;
    if (filters.termId) whereClause.termId = filters.termId;
    if (filters.classId) whereClause.classId = filters.classId;

    const dbInvoices = await this.prisma.invoice.findMany({
      where: whereClause,
      include: {
        student: {
          include: {
            campus: true,
            enrollments: {
              include: {
                class: true,
              },
            },
            parents: {
              include: {
                parent: true,
              },
            },
          },
        },
      },
    });

    const rawInvoices = dbInvoices.map((inv: any) => {
      const student = inv.student;
      const primaryParentRel = student?.parents?.[0];
      const parent = primaryParentRel?.parent;
      const currentEnrollment = student?.enrollments?.[0];
      return {
        id: inv.id,
        tenantId: inv.tenantId,
        studentId: inv.studentId,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
        admissionNumber: student?.admissionNumber || 'N/A',
        classId: inv.classId || currentEnrollment?.classId,
        className: currentEnrollment?.class?.name || 'Class',
        campusId: student?.campusId,
        invoiceNumber: inv.invoiceNumber,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount || 0,
        balanceAmount: inv.balanceAmount,
        currency: inv.currency || 'NGN',
        dueDate: inv.dueDate,
        createdAt: inv.createdAt,
        lastReminderSentAt: (inv as any).lastReminderSentAt || null,
        reminderCount: (inv as any).reminderCount || 0,
        parent: parent
          ? {
              id: parent.id,
              userId: parent.userId || parent.id,
              name: `${parent.firstName} ${parent.lastName}`,
              phone: parent.phone,
              email: parent.email,
            }
          : null,
      };
    });

    const defaulters: any[] = [];
    for (const inv of rawInvoices) {
      const balance = inv.balanceAmount;
      if (balance <= 0) continue;
      if (filters.minDebtAmount && balance < filters.minDebtAmount) continue;
      if (filters.campusId && inv.campusId && inv.campusId !== filters.campusId) continue;

      const daysOverdue = AgingAnalysisCalculator.calculateDaysOverdue(inv.dueDate || inv.createdAt, referenceDate);
      const bucket = AgingAnalysisCalculator.categorizeBucket(daysOverdue);

      if (filters.agingBucket && bucket !== filters.agingBucket) continue;

      defaulters.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        studentId: inv.studentId,
        studentName: inv.studentName,
        admissionNumber: inv.admissionNumber,
        classId: inv.classId,
        className: inv.className,
        parent: inv.parent,
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
    const whereClause: any = {
      tenantId,
      status: { not: 'CANCELLED' },
    };
    if (filters.campusId) whereClause.campusId = filters.campusId;
    if (filters.academicYearId) whereClause.academicYearId = filters.academicYearId;
    if (filters.termId) whereClause.termId = filters.termId;

    const invoices = await this.prisma.invoice.findMany({
      where: whereClause,
    });

    const metrics = AgingAnalysisCalculator.calculateMetrics(invoices as any, referenceDate);
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
    const student = await this.prisma.student.findFirst({
      where: { id: params.studentId, tenantId: params.tenantId },
    });

    if (!student) {
      throw new NotFoundException('Student record not found');
    }

    const policy = await this.getExamClearancePolicy(params.tenantId);
    const requiredPercentage =
      params.examType === ExamType.MID_TERM
        ? policy.midTermMinPercentagePaid
        : policy.finalExamMinPercentagePaid;

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId: params.tenantId,
        studentId: params.studentId,
        status: { not: 'CANCELLED' },
        ...(params.academicYearId ? { academicYearId: params.academicYearId } : {}),
        ...(params.termId ? { termId: params.termId } : {}),
      },
    });

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
      agingBucket: dto.agingBucket,
    });

    const targetDefaulters = dto.invoiceIds?.length
      ? defaulters.filter((d) => dto.invoiceIds!.includes(d.invoiceId))
      : defaulters;

    let policy: any = null;
    if (this.policyService) {
      try {
        policy = await this.policyService.getSettings(tenantId);
      } catch (err: any) {
        this.logger.warn(`Could not load communication policy: ${err.message}`);
      }
    }

    const effectiveChannels: CampaignChannel[] = [];
    if (dto.channel === ReminderChannel.EMAIL) {
      effectiveChannels.push(CampaignChannel.EMAIL);
    } else if (dto.channel === ReminderChannel.SMS) {
      effectiveChannels.push(CampaignChannel.SMS);
    } else if (dto.channel === ReminderChannel.BOTH) {
      effectiveChannels.push(CampaignChannel.EMAIL, CampaignChannel.SMS);
    } else if (dto.channel === ReminderChannel.IN_APP) {
      effectiveChannels.push(CampaignChannel.IN_APP);
    } else if (dto.channel === ReminderChannel.WHATSAPP) {
      effectiveChannels.push(CampaignChannel.WHATSAPP);
    } else if (dto.channel === ReminderChannel.ALL) {
      effectiveChannels.push(
        CampaignChannel.IN_APP,
        CampaignChannel.EMAIL,
        CampaignChannel.SMS,
        CampaignChannel.WHATSAPP,
      );
    } else if (policy?.feeReminderChannels && policy.feeReminderChannels.length > 0) {
      effectiveChannels.push(...policy.feeReminderChannels);
    } else {
      effectiveChannels.push(CampaignChannel.IN_APP, CampaignChannel.EMAIL);
    }

    let template: any = null;
    if (this.templateService) {
      try {
        if (dto.templateId) {
          template = await this.templateService.getTemplateById(tenantId, dto.templateId);
        } else {
          template = await this.templateService.getTemplateById(tenantId, 'tmpl_fee_reminder');
        }
      } catch (err: any) {
        this.logger.warn(`Could not fetch template for fee reminder: ${err.message}`);
      }
    }

    let remindersDispatched = 0;
    const dispatchedInvoices: string[] = [];
    const dispatchDetails: any[] = [];

    for (const d of targetDefaulters) {
      const now = new Date();

      await this.prisma.invoice.update({
        where: { id: d.invoiceId },
        data: {
          updatedAt: now,
        },
      }).catch(() => {});

      const formattedDueDate = d.dueDate
        ? new Date(d.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Immediate';
      const formattedAmount = `${d.currency} ${Number(d.balanceAmount).toLocaleString()}`;

      const variables: Record<string, any> = {
        parentName: d.parent?.name || 'Parent/Guardian',
        studentName: d.studentName,
        amount: formattedAmount,
        balance: formattedAmount,
        dueDate: formattedDueDate,
        currency: d.currency || 'NGN',
        invoiceNumber: d.invoiceNumber || 'INV',
        admissionNumber: d.admissionNumber || 'N/A',
        className: d.className || 'Class',
        daysOverdue: d.daysOverdue,
      };

      let subject = `Fee Payment Reminder: ${d.studentName}`;
      let body =
        dto.customMessage ||
        `Dear ${variables.parentName}, this is a reminder regarding outstanding school fees of ${formattedAmount} for ${d.studentName} (${d.admissionNumber}). Please settle on or before ${formattedDueDate}.`;

      if (template && !dto.customMessage) {
        if (template.subjectTemplate) {
          subject = this.templateService?.render(template.subjectTemplate, variables) || subject;
        }
        if (template.bodyTemplate) {
          body = this.templateService?.render(template.bodyTemplate, variables) || body;
        }
      }

      const channelsUsedForDefaulter: string[] = [];

      // 1. IN_APP dispatch
      if (
        effectiveChannels.includes(CampaignChannel.IN_APP) &&
        (policy === null || policy.inAppEnabled !== false)
      ) {
        const recipientUserId = d.parent?.userId || d.parent?.id || d.studentId;
        if (this.notificationsService && recipientUserId) {
          await this.notificationsService.createInboxItem(tenantId, {
            recipientUserId,
            title: subject,
            message: body,
            category: 'FEE_REMINDER',
            priority: d.daysOverdue > 30 ? 'HIGH' : 'NORMAL',
            actionUrl: `/portal/finance/invoices/${d.invoiceId}`,
          });
          channelsUsedForDefaulter.push('IN_APP');
        }
      }

      // 2. EMAIL dispatch
      if (
        effectiveChannels.includes(CampaignChannel.EMAIL) &&
        (policy === null || policy.emailEnabled !== false) &&
        d.parent?.email
      ) {
        if (this.queueService) {
          await this.queueService.dispatch(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
            tenantId,
            data: {
              recipientEmail: d.parent.email,
              title: subject,
              message: body,
              invoiceId: d.invoiceId,
              balanceAmount: d.balanceAmount,
            },
          });
        }
        channelsUsedForDefaulter.push('EMAIL');
      }

      // 3. SMS dispatch
      const isSmsRequested = dto.channel === ReminderChannel.SMS || dto.channel === ReminderChannel.BOTH || dto.channel === ReminderChannel.ALL;
      if (
        effectiveChannels.includes(CampaignChannel.SMS) &&
        (isSmsRequested || policy === null || policy.smsEnabled === true) &&
        d.parent?.phone
      ) {
        let smsSuccess = true;
        if (this.walletService) {
          const cost = policy?.smsUnitCost || 4.0;
          try {
            const debitRes = await this.walletService.debitWallet(
              tenantId,
              cost,
              'SMS',
              `Fee reminder SMS for invoice ${d.invoiceNumber}`,
            );
            if (!debitRes.success) {
              this.logger.warn(`Wallet deduction rejected for SMS reminder: ${debitRes.error}`);
              smsSuccess = false;
            }
          } catch (err: any) {
            this.logger.warn(`Wallet deduction failed for SMS reminder: ${err.message}`);
            smsSuccess = false;
          }
        }
        if (smsSuccess) {
          channelsUsedForDefaulter.push('SMS');
        }
      }

      // 4. WHATSAPP dispatch
      const isWaRequested = dto.channel === ReminderChannel.WHATSAPP || dto.channel === ReminderChannel.ALL;
      if (
        effectiveChannels.includes(CampaignChannel.WHATSAPP) &&
        (isWaRequested || policy === null || policy.whatsappEnabled === true) &&
        d.parent?.phone
      ) {
        let waSuccess = true;
        if (this.walletService) {
          const cost = policy?.whatsappUnitCost || 8.5;
          try {
            const debitRes = await this.walletService.debitWallet(
              tenantId,
              cost,
              'WHATSAPP',
              `Fee reminder WhatsApp for invoice ${d.invoiceNumber}`,
            );
            if (!debitRes.success) {
              this.logger.warn(`Wallet deduction rejected for WhatsApp reminder: ${debitRes.error}`);
              waSuccess = false;
            }
          } catch (err: any) {
            this.logger.warn(`Wallet deduction failed for WhatsApp reminder: ${err.message}`);
            waSuccess = false;
          }
        }
        if (waSuccess) {
          channelsUsedForDefaulter.push('WHATSAPP');
        }
      }

      remindersDispatched++;
      dispatchedInvoices.push(d.invoiceId);
      dispatchDetails.push({
        invoiceId: d.invoiceId,
        studentName: d.studentName,
        parentName: d.parent?.name,
        channels: channelsUsedForDefaulter,
        balanceAmount: d.balanceAmount,
      });
    }

    return {
      tenantId,
      totalTargeted: targetDefaulters.length,
      remindersDispatched,
      channel: dto.channel || 'POLICY_DEFAULT',
      channelsUsed: Array.from(new Set(dispatchDetails.flatMap((d) => d.channels))),
      reminderLevel: dto.reminderLevel || ReminderLevel.FIRST_OVERDUE,
      dispatchedAt: new Date().toISOString(),
      dispatchedInvoices,
      details: dispatchDetails,
    };
  }
}
