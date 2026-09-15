import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import {
  CreateFeeStructureDto,
  UpdateFeeStructureDto,
  EvaluateStudentFeeDto,
} from './dto/fee-structure.dto.js';
import { FeeCalculator } from './calculator/fee-calculator.js';

@Injectable()
export class FeesService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Fee Structures Management ---
  async getFeeStructures(
    tenantId: string,
    filters: { campusId?: string; academicYearId?: string; termId?: string; classId?: string },
  ) {
    let list = Array.from(this.prisma.memoryStore.feeStructures.values()).filter(
      (f: any) => f.tenantId === tenantId,
    );

    if (filters.campusId) list = list.filter((f: any) => !f.campusId || f.campusId === filters.campusId);
    if (filters.academicYearId) list = list.filter((f: any) => f.academicYearId === filters.academicYearId);
    if (filters.termId) list = list.filter((f: any) => f.termId === filters.termId);
    if (filters.classId) list = list.filter((f: any) => !f.classId || f.classId === filters.classId);

    return list;
  }

  async getFeeStructureById(tenantId: string, id: string) {
    const fee = this.prisma.memoryStore.feeStructures.get(id);
    if (!fee || fee.tenantId !== tenantId) {
      throw new NotFoundException('Fee structure not found');
    }
    return fee;
  }

  async createFeeStructure(tenantId: string, dto: CreateFeeStructureDto) {
    const id = `fee_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const items = dto.items || [];
    const calculatedMandatoryAmount = items
      .filter((it) => !it.isOptional)
      .reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

    const totalAmount = dto.amount !== undefined ? Number(dto.amount) : calculatedMandatoryAmount;

    const fee = {
      id,
      tenantId,
      campusId: dto.campusId,
      academicYearId: dto.academicYearId,
      termId: dto.termId || null,
      classId: dto.classId || null,
      name: dto.name,
      code: dto.code || dto.name.toUpperCase().replace(/\s+/g, '_'),
      description: dto.description || null,
      amount: totalAmount,
      currency: dto.currency || 'USD',
      items,
      targetAudience: dto.targetAudience || 'ALL',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      applicableGradeLevel: dto.applicableGradeLevel || null,
      lateFeePercentage: dto.lateFeePercentage || 0,
      lateFeeGraceDays: dto.lateFeeGraceDays || 0,
      earlyBirdDiscountPercentage: dto.earlyBirdDiscountPercentage || 0,
      earlyBirdCutoffDate: dto.earlyBirdCutoffDate ? new Date(dto.earlyBirdCutoffDate) : null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.feeStructures.set(id, fee);
    return fee;
  }

  async updateFeeStructure(tenantId: string, id: string, dto: UpdateFeeStructureDto) {
    const fee = await this.getFeeStructureById(tenantId, id);

    if (dto.name) fee.name = dto.name;
    if (dto.code) fee.code = dto.code;
    if (dto.description !== undefined) fee.description = dto.description;
    if (dto.termId !== undefined) fee.termId = dto.termId;
    if (dto.classId !== undefined) fee.classId = dto.classId;
    if (dto.applicableGradeLevel !== undefined) fee.applicableGradeLevel = dto.applicableGradeLevel;
    if (dto.targetAudience !== undefined) fee.targetAudience = dto.targetAudience;
    if (dto.currency !== undefined) fee.currency = dto.currency;
    if (dto.dueDate !== undefined) fee.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.lateFeePercentage !== undefined) fee.lateFeePercentage = dto.lateFeePercentage;
    if (dto.lateFeeGraceDays !== undefined) fee.lateFeeGraceDays = dto.lateFeeGraceDays;
    if (dto.earlyBirdDiscountPercentage !== undefined) fee.earlyBirdDiscountPercentage = dto.earlyBirdDiscountPercentage;
    if (dto.earlyBirdCutoffDate !== undefined) {
      fee.earlyBirdCutoffDate = dto.earlyBirdCutoffDate ? new Date(dto.earlyBirdCutoffDate) : null;
    }
    if (dto.items) {
      fee.items = dto.items;
      fee.amount = dto.items
        .filter((it) => !it.isOptional)
        .reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
    }
    fee.updatedAt = new Date();

    this.prisma.memoryStore.feeStructures.set(id, fee);
    return fee;
  }

  async deleteFeeStructure(tenantId: string, id: string) {
    const fee = await this.getFeeStructureById(tenantId, id);
    this.prisma.memoryStore.feeStructures.delete(id);
    return { success: true, message: `Fee structure "${fee.name}" deleted successfully` };
  }

  // --- Fee Evaluation & Student Breakdown ---
  async evaluateStudentFee(tenantId: string, dto: EvaluateStudentFeeDto) {
    const fee = await this.getFeeStructureById(tenantId, dto.feeStructureId);
    const student = this.prisma.memoryStore.students.get(dto.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student record not found');
    }

    return FeeCalculator.evaluate({
      items: fee.items || [{ name: fee.name, code: 'BASE', amount: fee.amount, isOptional: false }],
      currency: fee.currency,
      targetAudience: fee.targetAudience,
      dueDate: fee.dueDate,
      lateFeePercentage: fee.lateFeePercentage,
      lateFeeGraceDays: fee.lateFeeGraceDays,
      earlyBirdDiscountPercentage: fee.earlyBirdDiscountPercentage,
      earlyBirdCutoffDate: fee.earlyBirdCutoffDate,
      selectedOptionalCodes: dto.selectedOptionalItemCodes,
      isNewStudent: dto.isNewStudent,
      isBoardingStudent: dto.isBoardingStudent,
      paymentDate: dto.paymentDate,
      waiverAmount: dto.waiverAmount,
    });
  }

  // --- Invoicing & Fee Processing ---
  async getInvoices(tenantId: string, filters: { studentId?: string; status?: string; classId?: string }) {
    let invoices = Array.from(this.prisma.memoryStore.invoices.values()).filter(
      (i: any) => i.tenantId === tenantId,
    );

    if (filters.studentId) invoices = invoices.filter((i: any) => i.studentId === filters.studentId);
    if (filters.status) invoices = invoices.filter((i: any) => i.status === filters.status);
    if (filters.classId) invoices = invoices.filter((i: any) => i.classId === filters.classId);

    return invoices.map((inv: any) => {
      const student =
        this.prisma.memoryStore.students.get(inv.studentId) ||
        Array.from(this.prisma.memoryStore.students.values()).find(
          (s: any) =>
            s.tenantId === tenantId && (s.admissionNumber === inv.studentId || s.id === inv.studentId),
        );

      const totalAmount = Number(inv.totalAmount !== undefined ? inv.totalAmount : inv.amount || 0);
      const paidAmount = Number(inv.paidAmount !== undefined ? inv.paidAmount : inv.paid || 0);
      const balanceAmount = Number(
        inv.balanceAmount !== undefined ? inv.balanceAmount : Math.max(0, totalAmount - paidAmount),
      );

      const normalizedStatus =
        paidAmount >= totalAmount && totalAmount > 0
          ? 'Paid'
          : paidAmount > 0
          ? 'Partial'
          : 'Pending';

      const dueDateStr =
        typeof inv.dueDate === 'string'
          ? inv.dueDate
          : inv.dueDate?.toISOString?.().split('T')[0] || '2025-10-15';

      const payments = Array.from(this.prisma.memoryStore.payments.values())
        .filter(
          (p: any) =>
            p.tenantId === tenantId &&
            p.invoiceId === inv.id &&
            (p.status === 'SUCCESSFUL' || p.status === 'Success'),
        )
        .map((p: any) => ({
          ref: p.reference || p.id,
          date:
            typeof p.paidAt === 'string'
              ? p.paidAt
              : (p.paidAt || p.createdAt)?.toISOString?.().split('T')[0] ||
                new Date().toISOString().split('T')[0],
          amount: Number(p.amount || 0),
          channel: p.channel || p.gateway || p.provider || 'Direct Bank Transfer',
        }));

      return {
        ...inv,
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id,
        student: student ? `${student.firstName} ${student.lastName}` : inv.student || 'Student',
        studentId: student ? student.admissionNumber || student.id : inv.studentId || 'STD-001',
        class: student?.currentClass || inv.class || 'JSS 1A',
        amount: totalAmount,
        paid: paidAmount,
        balance: balanceAmount,
        status: normalizedStatus,
        dueDate: dueDateStr,
        term: inv.termId || inv.term || 'First Term 2025/2026',
        items: (inv.lineItems || inv.items || []).map((it: any) => ({
          name: it.name || it.description || 'Fee Item',
          amount: Number(it.amount || 0),
        })),
        payments,
      };
    });
  }

  async generateInvoice(
    tenantId: string,
    data: any,
  ) {
    let student = data.studentId ? this.prisma.memoryStore.students.get(data.studentId) : null;
    if (!student && data.studentId) {
      student = Array.from(this.prisma.memoryStore.students.values()).find(
        (s: any) =>
          s.tenantId === tenantId && (s.admissionNumber === data.studentId || s.id === data.studentId),
      );
    }

    const fee = data.feeStructureId
      ? this.prisma.memoryStore.feeStructures.get(data.feeStructureId)
      : null;

    let subtotal = 0;
    let discountAmount = 0;
    let latePenaltyAmount = 0;
    let waiverAmount = 0;
    let totalAmount = 0;
    let lineItems = [];

    if (fee) {
      const evalRes = FeeCalculator.evaluate({
        items: fee.items || [{ name: fee.name, code: 'BASE', amount: fee.amount, isOptional: false }],
        currency: fee.currency,
        targetAudience: fee.targetAudience,
        dueDate: fee.dueDate,
        lateFeePercentage: fee.lateFeePercentage,
        lateFeeGraceDays: fee.lateFeeGraceDays,
        earlyBirdDiscountPercentage: fee.earlyBirdDiscountPercentage,
        earlyBirdCutoffDate: fee.earlyBirdCutoffDate,
        selectedOptionalCodes: data.selectedOptionalItemCodes,
        isNewStudent: data.isNewStudent,
        isBoardingStudent: data.isBoardingStudent,
        paymentDate: data.paymentDate,
        waiverAmount: data.waiverAmount,
      });
      subtotal = evalRes.subtotal;
      discountAmount = evalRes.discountAmount;
      latePenaltyAmount = evalRes.latePenaltyAmount;
      waiverAmount = evalRes.waiverAmount;
      totalAmount = evalRes.totalAmount;
      lineItems = evalRes.lineItems;
    } else {
      lineItems =
        data.items || [
          { name: 'Tuition Fee', amount: Number(data.amount) || 80000, isOptional: false },
          { name: 'Development Levy', amount: 20000, isOptional: false },
        ];
      subtotal = Number(
        data.subtotal || data.amount || lineItems.reduce((sum: number, it: any) => sum + Number(it.amount || 0), 0),
      );
      discountAmount = Number(data.discountAmount || 0);
      latePenaltyAmount = Number(data.latePenaltyAmount || 0);
      waiverAmount = Number(data.waiverAmount || 0);
      totalAmount = data.totalAmount !== undefined ? Number(data.totalAmount) : (subtotal - discountAmount - waiverAmount + latePenaltyAmount);
    }

    const count = this.prisma.memoryStore.invoices.size + 1;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${count.toString().padStart(4, '0')}`;
    const id = `inv_${randomUUID().replace(/-/g, '').substring(0, 10)}`;

    const invoice = {
      id,
      tenantId,
      studentId: student?.id || data.studentId || 'std_adhoc',
      student: data.student || (student ? `${student.firstName} ${student.lastName}` : 'Student'),
      feeStructureId: data.feeStructureId || fee?.id || null,
      classId: student?.currentClassId || data.class || 'JSS 1A',
      class: data.class || student?.currentClass || 'JSS 1A',
      academicYearId: fee?.academicYearId || 'ay_2026_2027',
      termId: data.term || fee?.termId || 'First Term 2025/2026',
      term: data.term || fee?.termId || 'First Term 2025/2026',
      invoiceNumber,
      subtotal,
      discountAmount,
      waiverAmount,
      latePenaltyAmount,
      totalAmount,
      paidAmount: 0,
      balanceAmount: totalAmount,
      currency: fee?.currency || 'NGN',
      lineItems,
      items: lineItems,
      notes: data.notes || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : fee?.dueDate || new Date(),
      status: totalAmount === 0 ? 'PAID' : 'PENDING',
      issuedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.invoices.set(id, invoice);
    return {
      ...invoice,
      amount: totalAmount,
      paid: 0,
      balance: totalAmount,
      status: invoice.status,
      dueDate: typeof invoice.dueDate === 'string' ? invoice.dueDate : invoice.dueDate.toISOString().split('T')[0],
      payments: [],
    };
  }

  // --- Fee Waivers & Discounts ---
  async applyFeeWaiver(
    tenantId: string,
    data: {
      invoiceId: string;
      studentId: string;
      waiverType: 'SIBLING_DISCOUNT' | 'SCHOLARSHIP' | 'FINANCIAL_AID' | 'STAFF_CHILD';
      amount: number;
      reason: string;
    },
  ) {
    const invoice = this.prisma.memoryStore.invoices.get(data.invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found');
    }

    const waiverId = `wv_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const waiver = {
      id: waiverId,
      tenantId,
      invoiceId: data.invoiceId,
      studentId: data.studentId,
      waiverType: data.waiverType,
      amount: Number(data.amount),
      reason: data.reason,
      appliedAt: new Date(),
    };

    this.prisma.memoryStore.feeWaivers.set(waiverId, waiver);

    // Update invoice totals
    const subtotal = invoice.subtotal !== undefined ? Number(invoice.subtotal) : Number(invoice.totalAmount || 0);
    const discountAmount = Number(invoice.discountAmount || 0);
    const latePenaltyAmount = Number(invoice.latePenaltyAmount || 0);
    invoice.waiverAmount = Number((invoice.waiverAmount || 0) + Number(data.amount));
    invoice.totalAmount = Math.max(0, subtotal - discountAmount - invoice.waiverAmount + latePenaltyAmount);
    invoice.balanceAmount = Math.max(0, invoice.totalAmount - (Number(invoice.paidAmount) || 0));
    if (invoice.balanceAmount === 0 && invoice.paidAmount > 0) {
      invoice.status = 'PAID';
    }
    invoice.updatedAt = new Date();
    this.prisma.memoryStore.invoices.set(invoice.id, invoice);

    return {
      waiver,
      updatedInvoice: invoice,
      message: `${data.waiverType} of ${data.amount} successfully applied to invoice.`,
    };
  }

  async getWaivers(tenantId: string, studentId?: string) {
    return Array.from(this.prisma.memoryStore.feeWaivers.values()).filter(
      (w: any) => w.tenantId === tenantId && (!studentId || w.studentId === studentId),
    );
  }
}
