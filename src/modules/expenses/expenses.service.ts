import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async listExpenses(tenantId: string, campusId?: string) {
    return Array.from(this.prisma.memoryStore.expenses.values()).filter(
      (e) => e.tenantId === tenantId && (!campusId || e.campusId === campusId),
    );
  }

  async createExpense(tenantId: string, data: any) {
    const id = `exp_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const expense = {
      id,
      tenantId,
      campusId: data.campusId || null,
      category: data.category,
      title: data.title,
      description: data.description || null,
      amount: Number(data.amount),
      currency: data.currency || 'USD',
      expenseDate: data.expenseDate ? new Date(data.expenseDate) : new Date(),
      receiptUrl: data.receiptUrl || null,
      approvedByUserId: data.approvedByUserId || null,
      createdAt: new Date(),
    };
    this.prisma.memoryStore.expenses.set(id, expense);
    return expense;
  }
}
