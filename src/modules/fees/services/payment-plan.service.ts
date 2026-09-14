import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreatePaymentPlanDto } from '../dto/debt-recovery.dto.js';
import { randomUUID } from 'crypto';

export interface PaymentPlanRecord {
  id: string;
  tenantId: string;
  invoiceId: string;
  studentId: string;
  totalAmount: number;
  totalInstallments: number;
  installments: Array<{
    installmentIndex: number;
    amount: number;
    dueDate: Date;
    paidAmount: number;
    status: 'PENDING' | 'PAID' | 'OVERDUE';
    paidAt?: Date;
    notes?: string;
  }>;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PaymentPlanService {
  private readonly paymentPlans = new Map<string, PaymentPlanRecord>();

  constructor(private readonly prisma: PrismaService) {}

  async createPaymentPlan(tenantId: string, dto: CreatePaymentPlanDto): Promise<PaymentPlanRecord> {
    const invoice = this.prisma.memoryStore.invoices.get(dto.invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.balanceAmount <= 0) {
      throw new BadRequestException('Invoice is already fully paid. Cannot create payment plan.');
    }

    const totalInstallmentSum = dto.installments.reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs(totalInstallmentSum - invoice.balanceAmount) > 0.01) {
      throw new BadRequestException(
        `Installments sum (${totalInstallmentSum}) must equal invoice balance amount (${invoice.balanceAmount}).`,
      );
    }

    const planId = `pplan_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const plan: PaymentPlanRecord = {
      id: planId,
      tenantId,
      invoiceId: dto.invoiceId,
      studentId: dto.studentId,
      totalAmount: invoice.balanceAmount,
      totalInstallments: dto.installments.length,
      installments: dto.installments.map((inst, idx) => ({
        installmentIndex: idx + 1,
        amount: inst.amount,
        dueDate: new Date(inst.dueDate),
        paidAmount: 0,
        status: 'PENDING',
        notes: inst.notes,
      })),
      status: 'ACTIVE',
      notes: dto.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.paymentPlans.set(dto.invoiceId, plan);
    invoice.hasPaymentPlan = true;
    invoice.paymentPlanId = planId;
    this.prisma.memoryStore.invoices.set(invoice.id, invoice);

    return plan;
  }

  async getPaymentPlan(tenantId: string, invoiceId: string): Promise<PaymentPlanRecord> {
    const plan = this.paymentPlans.get(invoiceId);
    if (!plan || plan.tenantId !== tenantId) {
      throw new NotFoundException('Payment plan not found for this invoice');
    }
    return plan;
  }

  async recordPayment(tenantId: string, invoiceId: string, amount: number) {
    const plan = await this.getPaymentPlan(tenantId, invoiceId);
    let remainingToCredit = amount;

    for (const inst of plan.installments) {
      if (inst.status === 'PAID') continue;
      const unpaidOnInst = inst.amount - inst.paidAmount;

      if (remainingToCredit >= unpaidOnInst) {
        inst.paidAmount = inst.amount;
        inst.status = 'PAID';
        inst.paidAt = new Date();
        remainingToCredit -= unpaidOnInst;
      } else {
        inst.paidAmount += remainingToCredit;
        remainingToCredit = 0;
        break;
      }
    }

    const allPaid = plan.installments.every((i) => i.status === 'PAID');
    if (allPaid) {
      plan.status = 'COMPLETED';
    }
    plan.updatedAt = new Date();
    this.paymentPlans.set(invoiceId, plan);
    return plan;
  }
}
