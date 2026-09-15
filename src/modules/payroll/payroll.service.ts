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

    return items.map((p) => this.enrichPayrollRecord(tenantId, p));
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
    return this.enrichPayrollRecord(tenantId, record);
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

    if ((dto as any).staff) {
      const teacherId = dto.staffUserId;
      if (!this.prisma.memoryStore.teachers.has(teacherId)) {
        this.prisma.memoryStore.teachers.set(teacherId, {
          id: teacherId,
          tenantId,
          campusId: dto.campusId || 'campus_main_01',
          employeeNumber: (dto as any).staffId || teacherId,
          fullName: (dto as any).staff,
          role: (dto as any).role || 'Teacher / Staff',
          department: (dto as any).department || 'General',
          status: 'Active',
          createdAt: new Date(),
        });
      }
      this.prisma.memoryStore.staffSalaryProfiles.set(`${tenantId}_${teacherId}`, {
        id: `ssp_${teacherId}`,
        tenantId,
        campusId: dto.campusId || 'campus_main_01',
        staffUserId: teacherId,
        basicSalary: breakdown.basicSalary,
        housingAllowance: breakdown.housingAllowance,
        transportAllowance: breakdown.transportAllowance,
        otherAllowances: breakdown.otherAllowances,
        bankName: (dto as any).bank || 'Zenith Bank Plc',
        accountNumber: (dto as any).accountNumber || '1029384756',
        isActive: true,
        createdAt: new Date(),
      });
    }

    this.prisma.memoryStore.payroll.set(id, record);
    return this.enrichPayrollRecord(tenantId, record);
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
    return this.enrichPayrollRecord(tenantId, record);
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
    return this.enrichPayrollRecord(tenantId, record);
  }

  private enrichPayrollRecord(tenantId: string, p: any) {
    const teacher =
      this.prisma.memoryStore.teachers.get(p.staffUserId) ||
      Array.from(this.prisma.memoryStore.teachers.values()).find(
        (t: any) =>
          t.id === p.staffUserId ||
          t.employeeId === p.staffUserId ||
          t.employeeNumber === p.staffUserId,
      );
    const user = this.prisma.memoryStore.users.get(p.staffUserId);
    const salaryProfile = this.prisma.memoryStore.staffSalaryProfiles?.get(
      `${tenantId}_${p.staffUserId}`,
    );

    const staffName =
      p.staff ||
      p.staffName ||
      teacher?.fullName ||
      (user ? `${user.firstName} ${user.lastName}` : `Staff (${p.staffUserId})`);
    const staffId = p.staffId || teacher?.employeeNumber || teacher?.employeeId || p.staffUserId;
    const role = p.role || teacher?.role || 'Staff Member';
    const department = p.department || teacher?.department || 'General';
    const basic = p.basic ?? p.basicSalary ?? 0;
    const allowances =
      p.allowances ??
      ((p.housingAllowance || 0) + (p.transportAllowance || 0) + (p.otherAllowances || 0));
    const deductions =
      p.deductions ??
      p.totalDeductions ??
      ((p.payeTax || 0) +
        (p.pensionEmployee || 0) +
        (p.nhf || 0) +
        (p.nhis || 0) +
        (p.otherDeductions || 0));
    const net = p.net ?? p.netSalary ?? basic + allowances - deductions;
    const bank = p.bank || salaryProfile?.bankName || 'Zenith Bank Plc';
    const accountNumber = p.accountNumber || salaryProfile?.accountNumber || '1029384756';

    const monthName =
      typeof p.month === 'number'
        ? [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
          ][p.month - 1]
        : p.month;
    const monthDisplay = p.year ? `${monthName} ${p.year}` : monthName;

    const allowanceBreakdown =
      p.allowanceBreakdown ||
      [
        { name: 'Housing Allowance', amount: p.housingAllowance || 0 },
        { name: 'Transport Subsidy', amount: p.transportAllowance || 0 },
        { name: 'Special / Duty Allowance', amount: p.otherAllowances || 0 },
      ].filter((a) => a.amount > 0);

    const deductionBreakdown =
      p.deductionBreakdown ||
      [
        { name: 'PAYE Income Tax', amount: p.payeTax || 0 },
        { name: 'Contributory Pension (8%)', amount: p.pensionEmployee || 0 },
        { name: 'National Housing Fund (2.5%)', amount: p.nhf || 0 },
      ].filter((d) => d.amount > 0);

    return {
      ...p,
      staff: staffName,
      staffName,
      staffId,
      role,
      department,
      basic,
      basicSalary: basic,
      allowances,
      deductions,
      net,
      netSalary: net,
      gross: p.grossSalary || basic + allowances,
      grossSalary: p.grossSalary || basic + allowances,
      bank,
      accountNumber,
      month: monthDisplay,
      monthNumber: typeof p.month === 'number' ? p.month : undefined,
      year: p.year || 2025,
      status:
        p.status === 'PAID'
          ? 'Processed'
          : p.status === 'APPROVED'
            ? 'Approved'
            : p.status === 'DRAFT'
              ? 'Processed'
              : p.status,
      allowanceBreakdown:
        allowanceBreakdown.length > 0
          ? allowanceBreakdown
          : [{ name: 'Standard Allowances', amount: allowances }],
      deductionBreakdown:
        deductionBreakdown.length > 0
          ? deductionBreakdown
          : [{ name: 'Statutory Deductions', amount: deductions }],
    };
  }
}
