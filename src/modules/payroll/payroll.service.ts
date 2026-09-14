import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import { NigerianTaxCalculator, SalaryCalculationInput } from './calculator/nigerian-tax-calculator.js';
import { CalculateSalaryDto, GenerateStaffPayrollDto, QueryPayrollDto } from './dto/payroll-calculation.dto.js';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(private readonly prisma: PrismaService) {}

  calculateSalary(dto: CalculateSalaryDto) {
    return NigerianTaxCalculator.calculate(dto);
  }

  async listPayroll(tenantId: string, query?: QueryPayrollDto) {
    if (this.prisma.isDbConnected) {
      return this.prisma.payroll.findMany({
        where: {
          tenantId,
          ...(query?.month && { month: Number(query.month) }),
          ...(query?.year && { year: Number(query.year) }),
          ...(query?.campusId && { campusId: query.campusId }),
          ...(query?.status && { status: query.status }),
          ...(query?.staffUserId && { staffUserId: query.staffUserId }),
        },
        include: {
          campus: { select: { id: true, name: true } },
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
      });
    }

    let items = Array.from(this.prisma.memoryStore.payroll.values()).filter((p) => p.tenantId === tenantId);
    if (query?.month) items = items.filter((p) => p.month === Number(query.month));
    if (query?.year) items = items.filter((p) => p.year === Number(query.year));
    if (query?.campusId) items = items.filter((p) => p.campusId === query.campusId);
    if (query?.status) items = items.filter((p) => p.status === query.status);
    if (query?.staffUserId) items = items.filter((p) => p.staffUserId === query.staffUserId);

    return items;
  }

  async getPayrollById(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      const record = await this.prisma.payroll.findFirst({
        where: { id, tenantId },
        include: { campus: { select: { id: true, name: true } } },
      });
      if (!record) throw new NotFoundException(`Payroll record "${id}" not found.`);
      return record;
    }

    const record = this.prisma.memoryStore.payroll.get(id);
    if (!record || record.tenantId !== tenantId) throw new NotFoundException('Payroll record not found.');
    return record;
  }

  async generatePayroll(tenantId: string, dto: GenerateStaffPayrollDto) {
    // 1. Calculate statutory deductions & breakdown
    const breakdown = NigerianTaxCalculator.calculate(dto);

    if (this.prisma.isDbConnected) {
      // 2. Prevent duplicate payroll for same staff in same period
      const existing = await this.prisma.payroll.findFirst({
        where: {
          tenantId,
          staffUserId: dto.staffUserId,
          month: Number(dto.month),
          year: Number(dto.year),
        },
      });

      if (existing) {
        throw new ConflictException(
          `Payroll for staff "${dto.staffUserId}" for period ${dto.month}/${dto.year} already exists.`,
        );
      }

      return this.prisma.payroll.create({
        data: {
          tenantId,
          campusId: dto.campusId,
          staffUserId: dto.staffUserId,
          month: Number(dto.month),
          year: Number(dto.year),
          basicSalary: breakdown.basicSalary,
          housingAllowance: breakdown.housingAllowance,
          transportAllowance: breakdown.transportAllowance,
          otherAllowances: breakdown.otherAllowances + breakdown.bonus,
          grossSalary: breakdown.grossSalary,
          pensionEmployee: breakdown.pensionEmployee,
          pensionEmployer: breakdown.pensionEmployer,
          nhf: breakdown.nhf,
          nhis: breakdown.nhis,
          payeTax: breakdown.payeTax,
          otherDeductions: breakdown.otherDeductions,
          totalDeductions: breakdown.totalDeductions,
          netSalary: breakdown.netSalary,
          currency: 'NGN',
          status: 'DRAFT',
          notes: dto.notes,
          breakdown: breakdown as any,
        },
      });
    }

    // In-memory fallback
    const id = `pay_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const existing = Array.from(this.prisma.memoryStore.payroll.values()).find(
      (p) =>
        p.tenantId === tenantId &&
        p.staffUserId === dto.staffUserId &&
        p.month === Number(dto.month) &&
        p.year === Number(dto.year),
    );
    if (existing) throw new ConflictException('Payroll record already exists for this period.');

    const record = {
      id,
      tenantId,
      campusId: dto.campusId,
      staffUserId: dto.staffUserId,
      month: Number(dto.month),
      year: Number(dto.year),
      basicSalary: breakdown.basicSalary,
      housingAllowance: breakdown.housingAllowance,
      transportAllowance: breakdown.transportAllowance,
      otherAllowances: breakdown.otherAllowances + breakdown.bonus,
      grossSalary: breakdown.grossSalary,
      pensionEmployee: breakdown.pensionEmployee,
      pensionEmployer: breakdown.pensionEmployer,
      nhf: breakdown.nhf,
      nhis: breakdown.nhis,
      payeTax: breakdown.payeTax,
      otherDeductions: breakdown.otherDeductions,
      totalDeductions: breakdown.totalDeductions,
      netSalary: breakdown.netSalary,
      currency: 'NGN',
      status: 'DRAFT',
      paymentDate: null,
      paymentReference: null,
      notes: dto.notes,
      breakdown,
      createdAt: new Date(),
    };

    this.prisma.memoryStore.payroll.set(id, record);
    return record;
  }

  async approvePayroll(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      const record = await this.prisma.payroll.findFirst({ where: { id, tenantId } });
      if (!record) throw new NotFoundException(`Payroll record "${id}" not found.`);
      return this.prisma.payroll.update({
        where: { id },
        data: { status: 'APPROVED' },
      });
    }

    const record = this.prisma.memoryStore.payroll.get(id);
    if (!record || record.tenantId !== tenantId) throw new NotFoundException('Payroll record not found');
    record.status = 'APPROVED';
    this.prisma.memoryStore.payroll.set(id, record);
    return record;
  }

  async markPaid(tenantId: string, id: string, paymentReference?: string) {
    if (this.prisma.isDbConnected) {
      const record = await this.prisma.payroll.findFirst({ where: { id, tenantId } });
      if (!record) throw new NotFoundException(`Payroll record "${id}" not found.`);
      return this.prisma.payroll.update({
        where: { id },
        data: {
          status: 'PAID',
          paymentDate: new Date(),
          paymentReference: paymentReference || `PAY_REF_${Date.now()}`,
        },
      });
    }

    const record = this.prisma.memoryStore.payroll.get(id);
    if (!record || record.tenantId !== tenantId) throw new NotFoundException('Payroll record not found');
    record.status = 'PAID';
    record.paymentDate = new Date();
    record.paymentReference = paymentReference || `PAY_REF_${Date.now()}`;
    this.prisma.memoryStore.payroll.set(id, record);
    return record;
  }
}
