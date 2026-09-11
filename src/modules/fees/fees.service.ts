import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class FeesService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeeStructures(tenantId: string, campusId?: string) {
    return Array.from(this.prisma.memoryStore.feeStructures.values()).filter(
      (f) => f.tenantId === tenantId && (!campusId || f.campusId === campusId),
    );
  }

  async createFeeStructure(tenantId: string, data: any) {
    const id = `fee_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const totalAmount = data.amount !== undefined 
      ? Number(data.amount) 
      : Array.isArray(data.items) 
        ? data.items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0) 
        : 0;

    const fee = {
      id,
      tenantId,
      campusId: data.campusId,
      academicYearId: data.academicYearId,
      termId: data.termId || null,
      name: data.name,
      amount: totalAmount,
      currency: data.currency || 'USD',
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      applicableGradeLevel: data.applicableGradeLevel || null,
      createdAt: new Date(),
    };
    this.prisma.memoryStore.feeStructures.set(id, fee);
    return fee;
  }

  async getInvoices(tenantId: string, filters: { studentId?: string; status?: string }) {
    let invoices = Array.from(this.prisma.memoryStore.invoices.values()).filter(
      (i) => i.tenantId === tenantId,
    );

    if (filters.studentId) {
      invoices = invoices.filter((i) => i.studentId === filters.studentId);
    }
    if (filters.status) {
      invoices = invoices.filter((i) => i.status === filters.status);
    }

    return invoices;
  }

  async generateInvoice(
    tenantId: string,
    data: {
      studentId: string;
      feeStructureId: string;
      dueDate: string;
    },
  ) {
    const fee = this.prisma.memoryStore.feeStructures.get(data.feeStructureId);
    if (!fee || fee.tenantId !== tenantId) {
      throw new NotFoundException('Fee structure not found');
    }

    const student = this.prisma.memoryStore.students.get(data.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student record not found');
    }

    const count = this.prisma.memoryStore.invoices.size + 1;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${count.toString().padStart(4, '0')}`;
    const id = `inv_${randomUUID().replace(/-/g, '').substring(0, 10)}`;

    const invoice = {
      id,
      tenantId,
      studentId: data.studentId,
      feeStructureId: data.feeStructureId,
      invoiceNumber,
      totalAmount: fee.amount,
      paidAmount: 0,
      balanceAmount: fee.amount,
      dueDate: new Date(data.dueDate),
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.invoices.set(id, invoice);
    return invoice;
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

    // Deduct from invoice total
    invoice.totalAmount = Math.max(0, invoice.totalAmount - Number(data.amount));
    invoice.balanceAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount);
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
      (w) => w.tenantId === tenantId && (!studentId || w.studentId === studentId),
    );
  }
}
