import { Injectable, NotFoundException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CloudflareR2StorageProvider } from '../../files/storage.provider.js';
import { BullmqService } from '../../../jobs/bullmq.service.js';
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
import { InvoiceRenderer } from '../renderer/invoice-renderer.js';
import { randomUUID } from 'crypto';

@Injectable()
export class BulkInvoicingService {
  private readonly logger = new Logger(BulkInvoicingService.name);
  private readonly siblingConfigs = new Map<string, SiblingDiscountConfigDto>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageProvider: CloudflareR2StorageProvider,
    @Optional() private readonly bullmqService?: BullmqService,
  ) {}

  async getSiblingDiscountConfig(tenantId: string): Promise<SiblingDiscountConfigDto> {
    return this.siblingConfigs.get(tenantId) || DEFAULT_SIBLING_DISCOUNT_CONFIG;
  }

  async updateSiblingDiscountConfig(tenantId: string, config: SiblingDiscountConfigDto) {
    this.siblingConfigs.set(tenantId, config);
    return config;
  }

  async getFamilySiblingBreakdown(tenantId: string, parentId: string) {
    const parent = this.prisma.memoryStore.parents.get(parentId);
    if (!parent || parent.tenantId !== tenantId) {
      throw new NotFoundException('Parent record not found');
    }
    const config = await this.getSiblingDiscountConfig(tenantId);
    const memory = this.prisma.memoryStore as any;
    const studentParents = Array.from(memory.studentParents?.values() || [])
      .filter((sp: any) => sp.parentId === parentId);

    const students = studentParents
      .map((sp: any) => this.prisma.memoryStore.students.get(sp.studentId))
      .filter((s: any) => s && s.tenantId === tenantId)
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

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
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    const campus = this.prisma.memoryStore.campuses.get(dto.campusId);
    if (!campus || campus.tenantId !== tenantId) {
      throw new NotFoundException('Campus record not found');
    }

    const config = await this.getSiblingDiscountConfig(tenantId);
    let students = Array.from(this.prisma.memoryStore.students.values()).filter(
      (s: any) => s.tenantId === tenantId && s.campusId === dto.campusId && s.status === 'ACTIVE',
    );

    if (dto.classIds?.length) {
      const classSet = new Set(dto.classIds);
      students = students.filter((s: any) => classSet.has(s.currentClassId) || classSet.has(s.classId));
    }

    const { parentStudentMap, studentParentMap } = this.buildFamilyMaps();
    const createdInvoices: any[] = [];
    let invoicesSkipped = 0;
    let totals = { subtotal: 0, discount: 0, waiver: 0, billed: 0 };
    const currency = tenant?.currency || 'NGN';

    for (const student of students) {
      const existing = this.findExistingInvoice(tenantId, student.id, dto.academicYearId, dto.termId);
      if (existing) {
        invoicesSkipped++;
        continue;
      }

      const feeStructure = this.resolveFeeStructure(tenantId, dto, student);
      const items = feeStructure?.items || [
        { name: feeStructure?.name || 'Term Tuition & Levies', code: 'TUI', amount: feeStructure?.amount || 150000, category: 'TUITION', isOptional: false },
      ];

      const baseFee = FeeCalculator.evaluate({
        items,
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

      const waiverAmount = this.resolveWaiverAmount(tenantId, student.id, dto.applyScholarshipsAndWaivers);
      const totalDiscounts = baseFee.discountAmount + siblingDiscount;
      const finalTotal = Math.max(0, baseFee.subtotal - totalDiscounts - waiverAmount + baseFee.latePenaltyAmount);

      totals.subtotal += baseFee.subtotal;
      totals.discount += totalDiscounts;
      totals.waiver += waiverAmount;
      totals.billed += finalTotal;

      const invoiceId = `inv_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      const invoiceNumber = `INV-${new Date().getFullYear()}-${(this.prisma.memoryStore.invoices.size + 1).toString().padStart(4, '0')}`;

      const invoiceRecord: any = {
        id: invoiceId,
        tenantId,
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        feeStructureId: feeStructure?.id || null,
        classId: student.currentClassId || null,
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
        dueDate: new Date(dto.dueDate),
        status: finalTotal === 0 ? 'PAID' : 'PENDING',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (!dto.dryRun) {
        this.prisma.memoryStore.invoices.set(invoiceId, invoiceRecord);
        const storageKey = `tenants/${tenantId}/invoices/${dto.academicYearId}/${dto.termId}/${invoiceId}.html`;
        const presigned = await this.storageProvider.generatePresignedDownload(storageKey, `${invoiceNumber}.html`);
        invoiceRecord.downloadUrl = presigned.downloadUrl;

        if (dto.notifyParents && this.bullmqService) {
          const parent = this.getParentForStudent(student.id, studentParentMap);
          await this.bullmqService.dispatch(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
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
    const invoice = this.prisma.memoryStore.invoices.get(invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found');
    }
    const storageKey = `tenants/${tenantId}/invoices/${invoice.academicYearId || 'general'}/${invoice.termId || 'term'}/${invoiceId}.html`;
    return this.storageProvider.generatePresignedDownload(storageKey, `${invoice.invoiceNumber}.html`);
  }

  private buildFamilyMaps() {
    const parentStudentMap = new Map<string, string[]>();
    const studentParentMap = new Map<string, string>();
    const memory = this.prisma.memoryStore as any;
    for (const sp of memory.studentParents?.values() || []) {
      if (!parentStudentMap.has(sp.parentId)) parentStudentMap.set(sp.parentId, []);
      parentStudentMap.get(sp.parentId)!.push(sp.studentId);
      studentParentMap.set(sp.studentId, sp.parentId);
    }
    return { parentStudentMap, studentParentMap };
  }

  private findExistingInvoice(tenantId: string, studentId: string, academicYearId: string, termId: string) {
    return Array.from(this.prisma.memoryStore.invoices.values()).find(
      (i: any) =>
        i.tenantId === tenantId && i.studentId === studentId &&
        i.academicYearId === academicYearId && i.termId === termId && i.status !== 'CANCELLED',
    );
  }

  private resolveFeeStructure(tenantId: string, dto: BulkGenerateInvoicesDto, student: any) {
    if (dto.feeStructureId) return this.prisma.memoryStore.feeStructures.get(dto.feeStructureId);
    return Array.from(this.prisma.memoryStore.feeStructures.values()).find(
      (f: any) =>
        f.tenantId === tenantId && f.campusId === dto.campusId &&
        f.academicYearId === dto.academicYearId && (!f.classId || f.classId === student.currentClassId),
    );
  }

  private calculateSiblingDiscountForStudent(
    studentId: string, apply: boolean | undefined,
    studentParentMap: Map<string, string>, parentStudentMap: Map<string, string[]>,
    lineItems: any[], config: SiblingDiscountConfigDto,
  ) {
    if (apply === false) return { siblingDiscount: 0, siblingTierName: '' };
    const parentId = studentParentMap.get(studentId);
    const familyStudentIds = parentId ? parentStudentMap.get(parentId) || [studentId] : [studentId];
    const studentIndex = Math.max(0, familyStudentIds.indexOf(studentId));
    const sibRes = SiblingDiscountCalculator.evaluateSiblingDiscount({
      studentIndex, totalSiblings: familyStudentIds.length, lineItems, config,
    });
    return { siblingDiscount: sibRes.discountAmount, siblingTierName: sibRes.tierName };
  }

  private resolveWaiverAmount(tenantId: string, studentId: string, apply: boolean | undefined) {
    if (apply === false) return 0;
    const waiver = Array.from(this.prisma.memoryStore.feeWaivers?.values() || []).find(
      (w: any) => w.tenantId === tenantId && w.studentId === studentId,
    );
    return waiver?.waiverAmount || 0;
  }

  private getParentForStudent(studentId: string, studentParentMap: Map<string, string>) {
    const parentId = studentParentMap.get(studentId);
    return parentId ? this.prisma.memoryStore.parents.get(parentId) : null;
  }
}

