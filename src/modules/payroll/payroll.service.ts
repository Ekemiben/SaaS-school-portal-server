import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async listPayroll(tenantId: string, month?: number, year?: number) {
    let items = Array.from(this.prisma.memoryStore.payroll.values()).filter(
      (p) => p.tenantId === tenantId,
    );

    if (month) items = items.filter((p) => p.month === Number(month));
    if (year) items = items.filter((p) => p.year === Number(year));

    return items;
  }

  async generatePayroll(tenantId: string, data: any) {
    const id = `pay_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const basic = Number(data.basicSalary);
    const allowances = Number(data.allowances || 0);
    const deductions = Number(data.deductions || 0);
    const netSalary = basic + allowances - deductions;

    const record = {
      id,
      tenantId,
      staffUserId: data.staffUserId,
      month: Number(data.month),
      year: Number(data.year),
      basicSalary: basic,
      allowances,
      deductions,
      netSalary,
      status: 'DRAFT',
      paymentDate: null,
      createdAt: new Date(),
    };

    this.prisma.memoryStore.payroll.set(id, record);
    return record;
  }

  async approvePayroll(tenantId: string, id: string) {
    const record = this.prisma.memoryStore.payroll.get(id);
    if (!record || record.tenantId !== tenantId) {
      throw new NotFoundException('Payroll record not found');
    }
    record.status = 'APPROVED';
    this.prisma.memoryStore.payroll.set(id, record);
    return record;
  }

  async markPaid(tenantId: string, id: string) {
    const record = this.prisma.memoryStore.payroll.get(id);
    if (!record || record.tenantId !== tenantId) {
      throw new NotFoundException('Payroll record not found');
    }
    record.status = 'PAID';
    record.paymentDate = new Date();
    this.prisma.memoryStore.payroll.set(id, record);
    return record;
  }
}
