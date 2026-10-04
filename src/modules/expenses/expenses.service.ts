import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async listExpenses(tenantId: string, campusId?: string) {
    return this.prisma.expense.findMany({
      where: {
        tenantId,
        ...(campusId ? { campusId } : {}),
      },
      orderBy: { expenseDate: 'desc' },
    });
  }

  async getExpenseById(tenantId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId },
    });
    if (!expense) {
      throw new NotFoundException(`Expense with ID "${id}" not found.`);
    }
    return expense;
  }

  async createExpense(tenantId: string, data: any) {
    return this.prisma.expense.create({
      data: {
        tenantId,
        campusId: data.campusId || null,
        category: data.category || 'OPERATIONAL',
        title: data.title,
        description: data.description || null,
        amount: Number(data.amount),
        currency: data.currency || 'NGN',
        expenseDate: data.expenseDate ? new Date(data.expenseDate) : new Date(),
        receiptUrl: data.receiptUrl || null,
        approvedByUserId: data.approvedByUserId || null,
      },
    });
  }

  async deleteExpense(tenantId: string, id: string) {
    const expense = await this.getExpenseById(tenantId, id);
    await this.prisma.expense.delete({
      where: { id },
    });
    return { success: true, message: `Expense "${expense.title}" deleted successfully.` };
  }
}
