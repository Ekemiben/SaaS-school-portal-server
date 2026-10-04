import { Injectable, NotFoundException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CloudflareR2StorageProvider } from '../../files/storage.provider.js';
import { QueueService } from '../../../jobs/queue.service.js';
import { QUEUES, JOB_TYPES } from '../../../jobs/queue.constants.js';
import {
  BulkGenerateInvoicesDto,
  BulkInvoicingResultDto,
  SiblingDiscountConfigDto,
} from '../dto/bulk-invoice.dto.js';
import {
  SiblingDiscountCalculator,
  DEFAULT_SIBLING_DISCOUNT_CONFIG,
} from '../calculator/sibling-discount-calculator.js';
import { FeeCalculator } from '../calculator/fee-calculator.js';
import { randomUUID } from 'crypto';

@Injectable()
export class BulkInvoicingService {
  private readonly logger = new Logger(BulkInvoicingService.name);
  private readonly siblingConfigs = new Map<string, SiblingDiscountConfigDto>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageProvider: CloudflareR2StorageProvider,
    @Optional() private readonly queueService?: QueueService,
  ) {}

  async getSiblingDiscountConfig(tenantId: string): Promise<SiblingDiscountConfigDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { features: true },
    });
    const features = tenant?.features as any;
    if (features?.siblingDiscountConfig) {
      return features.siblingDiscountConfig as SiblingDiscountConfigDto;
    }
    return this.siblingConfigs.get(tenantId) || DEFAULT_SIBLING_DISCOUNT_CONFIG;
  }

  async updateSiblingDiscountConfig(tenantId: string, config: SiblingDiscountConfigDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { features: true },
    });
    const existingFeatures = (tenant?.features as any) || {};
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        features: {
          ...existingFeatures,
          siblingDiscountConfig: config,
        },
      },
    });
    this.siblingConfigs.set(tenantId, config);
    return config;
  }

  async getFamilySiblingBreakdown(tenantId: string, parentId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      include: {
        students: {
          include: { student: true },
        },
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent record not found');
    }

    const students = (parent.students || [])
      .map((sp: any) => sp.student)
      .filter((s: any) => s && s.status === 'ACTIVE')
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const config = await this.getSiblingDiscountConfig(tenantId);

    const siblings = students.map((s: any, idx: number) => {
      const discount = SiblingDiscountCalculator.evaluateSiblingDiscount({
        studentIndex: idx,
        totalSiblings: students.length,
        lineItems: [{ amount: 100000, category: 'TUITION', isIncluded: true }],
        config,
      });
      return {
        studentId: s.id,
        fullName: `${s.firstName} ${s.lastName}`,
        admissionNumber: s.admissionNumber,
        childIndex: idx + 1,
        totalSiblings: students.length,
        discountPercentage: discount.discountPercentage,
        tierName: discount.tierName,
      };
    });

    return {
      parent: { id: parent.id, name: `${parent.firstName} ${parent.lastName}`, phone: parent.phone },
      totalChildren: students.length,
      isEligibleForSiblingDiscount: config.isEnabled && students.length > 1,
      siblings,
    };
  }

  async bulkGenerateInvoices(
    tenantId: string,
    userId: string,
    dto: BulkGenerateInvoicesDto,
  ): Promise<BulkInvoicingResultDto> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant '${tenantId}' not found`);
    }

    const studentWhere: any = {
      tenantId,
      campusId: dto.campusId,
      status: 'ACTIVE',
    };
    if (dto.classIds?.length) {
      studentWhere.enrollments = {
        some: {
          classId: { in: dto.classIds },
          status: 'ACTIVE',
        },
      };
    }

    const students = await this.prisma.student.findMany({
      where: studentWhere,
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { class: true },
          orderBy: { enrolledAt: 'desc' },
          take: 1,
        },
      },
    });

    const config = await this.getSiblingDiscountConfig(tenantId);
    const { parentStudentMap, studentParentMap } = await this.buildFamilyMaps(tenantId);
    const createdInvoices: any[] = [];
    let invoicesSkipped = 0;
    const totals = { subtotal: 0, discount: 0, waiver: 0, billed: 0 };
    const currency = tenant?.currency || 'NGN';

    const currentTotalInvoices = await this.prisma.invoice.count({ where: { tenantId } });

    for (const student of students) {
      const existing = await this.findExistingInvoice(tenantId, student.id, dto.academicYearId, dto.termId);
      if (existing) {
        invoicesSkipped++;
        continue;
      }

      const feeStructure = await this.resolveFeeStructure(tenantId, dto, student);
      const items = feeStructure?.items || [
        { name: feeStructure?.name || 'Term Tuition & Levies', code: 'TUI', amount: feeStructure?.amount || 150000, category: 'TUITION', isOptional: false },
      ];

      const baseFee = FeeCalculator.evaluate({
        items: items as any,
        currency,
        dueDate: dto.dueDate || feeStructure?.dueDate,
        lateFeePercentage: feeStructure?.lateFeePercentage,
        lateFeeGraceDays: feeStructure?.lateFeeGraceDays,
        earlyBirdDiscountPercentage: feeStructure?.earlyBirdDiscountPercentage,
        earlyBirdCutoffDate: feeStructure?.earlyBirdCutoffDate,
      });

      const { siblingDiscount, siblingTierName } = this.calculateSiblingDiscountForStudent(
        student.id,
        dto.applySiblingDiscounts,
        studentParentMap,
        parentStudentMap,
        baseFee.lineItems,
        config,
      );

      const waiverAmount = await this.resolveWaiverAmount(tenantId, student.id, dto.applyScholarshipsAndWaivers);
      const totalDiscounts = baseFee.discountAmount + siblingDiscount;
      const finalTotal = Math.max(0, baseFee.subtotal - totalDiscounts - waiverAmount + baseFee.latePenaltyAmount);

      totals.subtotal += baseFee.subtotal;
      totals.discount += totalDiscounts;
      totals.waiver += waiverAmount;
      totals.billed += finalTotal;

      const invoiceId = `inv_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      const invoiceNumber = `INV-${new Date().getFullYear()}-${(currentTotalInvoices + createdInvoices.length + 1).toString().padStart(4, '0')}`;
      const classId = student.enrollments?.[0]?.classId || null;
      const dueDate = new Date(dto.dueDate);

      const invoiceRecord: any = {
        id: invoiceId,
        tenantId,
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        feeStructureId: feeStructure?.id || null,
        classId,
        academicYearId: dto.academicYearId,
        termId: dto.termId,
        invoiceNumber,
        subtotal: baseFee.subtotal,
        discountAmount: totalDiscounts,
        siblingDiscountAmount: siblingDiscount,
        siblingTier: siblingTierName || undefined,
        waiverAmount,
        latePenaltyAmount: baseFee.latePenaltyAmount,
        totalAmount: finalTotal,
        paidAmount: 0,
        balanceAmount: finalTotal,
        currency,
        lineItems: baseFee.lineItems,
        dueDate,
        status: finalTotal === 0 ? 'PAID' : 'PENDING',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (!dto.dryRun) {
        await this.prisma.invoice.create({
          data: {
            id: invoiceId,
            tenantId,
            studentId: student.id,
            feeStructureId: invoiceRecord.feeStructureId,
            classId: invoiceRecord.classId,
            academicYearId: invoiceRecord.academicYearId,
            termId: invoiceRecord.termId,
            invoiceNumber,
            subtotal: invoiceRecord.subtotal,
            discountAmount: invoiceRecord.discountAmount,
            waiverAmount: invoiceRecord.waiverAmount,
            latePenaltyAmount: invoiceRecord.latePenaltyAmount,
            totalAmount: invoiceRecord.totalAmount,
            paidAmount: 0,
            balanceAmount: invoiceRecord.totalAmount,
            currency,
            lineItems: invoiceRecord.lineItems,
            dueDate,
            status: invoiceRecord.status as any,
          },
        });

        const storageKey = `tenants/${tenantId}/invoices/${dto.academicYearId}/${dto.termId}/${invoiceId}.html`;
        const presigned = await this.storageProvider.generatePresignedDownload(storageKey, `${invoiceNumber}.html`);
        invoiceRecord.downloadUrl = presigned.downloadUrl;

        if (dto.notifyParents && this.queueService) {
          const parent = await this.getParentForStudent(student.id, studentParentMap, tenantId);
          await this.queueService.dispatch(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
            tenantId,
            data: {
              recipientEmail: parent?.email || 'parent@school.edu.ng',
              title: `New School Invoice ${invoiceNumber}`,
              message: `Invoice ${invoiceNumber} for ${student.firstName} is now available.`,
              downloadUrl: presigned.downloadUrl,
            },
          });
        }
      }

      createdInvoices.push(invoiceRecord);
    }

    return {
      jobId: `job_bulk_inv_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
      tenantId,
      campusId: dto.campusId,
      academicYearId: dto.academicYearId,
      termId: dto.termId,
      totalStudents: students.length,
      invoicesCreated: createdInvoices.length,
      invoicesSkipped,
      totalSubtotal: Number(totals.subtotal.toFixed(2)),
      totalDiscountAmount: Number(totals.discount.toFixed(2)),
      totalWaiverAmount: Number(totals.waiver.toFixed(2)),
      totalBilledAmount: Number(totals.billed.toFixed(2)),
      currency,
      dryRun: !!dto.dryRun,
      generatedAt: new Date().toISOString(),
      invoices: createdInvoices,
    };
  }

  async getInvoiceDownload(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const storageKey = `tenants/${tenantId}/invoices/${invoice.academicYearId || 'general'}/${invoice.termId || 'term'}/${invoiceId}.html`;
    return this.storageProvider.generatePresignedDownload(storageKey, `${invoice.invoiceNumber}.html`);
  }

  private async buildFamilyMaps(tenantId: string) {
    const parentStudentMap = new Map<string, string[]>();
    const studentParentMap = new Map<string, string>();

    const studentParents = await this.prisma.studentParent.findMany({
      where: { student: { tenantId } },
    });

    for (const sp of studentParents) {
      if (!parentStudentMap.has(sp.parentId)) parentStudentMap.set(sp.parentId, []);
      parentStudentMap.get(sp.parentId)!.push(sp.studentId);
      studentParentMap.set(sp.studentId, sp.parentId);
    }

    return { parentStudentMap, studentParentMap };
  }

  private async findExistingInvoice(tenantId: string, studentId: string, academicYearId: string, termId: string) {
    return this.prisma.invoice.findFirst({
      where: {
        tenantId,
        studentId,
        academicYearId,
        termId,
        status: { not: 'CANCELLED' },
      },
    });
  }

  private async resolveFeeStructure(tenantId: string, dto: BulkGenerateInvoicesDto, student: any) {
    if (dto.feeStructureId) {
      const fs = await this.prisma.feeStructure.findFirst({
        where: { id: dto.feeStructureId, tenantId },
      });
      if (fs) return fs;
    }

    const studentClassId = student.enrollments?.[0]?.classId;
    return this.prisma.feeStructure.findFirst({
      where: {
        tenantId,
        campusId: dto.campusId,
        academicYearId: dto.academicYearId,
        OR: [
          { classId: studentClassId },
          { classId: null },
        ],
      },
    });
  }

  private calculateSiblingDiscountForStudent(
    studentId: string,
    apply: boolean | undefined,
    studentParentMap: Map<string, string>,
    parentStudentMap: Map<string, string[]>,
    lineItems: any[],
    config: SiblingDiscountConfigDto,
  ) {
    if (apply === false) return { siblingDiscount: 0, siblingTierName: '' };
    const parentId = studentParentMap.get(studentId);
    const familyStudentIds = parentId ? parentStudentMap.get(parentId) || [studentId] : [studentId];
    const studentIndex = Math.max(0, familyStudentIds.indexOf(studentId));
    const sibRes = SiblingDiscountCalculator.evaluateSiblingDiscount({
      studentIndex,
      totalSiblings: familyStudentIds.length,
      lineItems,
      config,
    });
    return { siblingDiscount: sibRes.discountAmount, siblingTierName: sibRes.tierName };
  }

  private async resolveWaiverAmount(tenantId: string, studentId: string, apply: boolean | undefined) {
    if (apply === false) return 0;
    const waiver = await this.prisma.feeWaiver.findFirst({
      where: { tenantId, studentId },
    });
    return waiver?.waiverAmount || 0;
  }

  private async getParentForStudent(studentId: string, studentParentMap: Map<string, string>, tenantId: string) {
    const parentId = studentParentMap.get(studentId);
    if (!parentId) return null;
    return this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
    });
  }
}
