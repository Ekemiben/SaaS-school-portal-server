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
    const fee = {
      id,
      tenantId,
      campusId: data.campusId,
      academicYearId: data.academicYearId,
      termId: data.termId || null,
      name: data.name,
      amount: Number(data.amount),
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
}
