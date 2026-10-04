import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { NigerianTaxCalculator } from './calculator/nigerian-tax-calculator.js';
import { CalculateSalaryDto, GenerateStaffPayrollDto, QueryPayrollDto } from './dto/payroll-calculation.dto.js';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(private readonly prisma: PrismaService) {}

  calculateSalary(dto: CalculateSalaryDto) {
    return NigerianTaxCalculator.calculate(dto);
  }

  async listPayroll(tenantId: string, query?: QueryPayrollDto) {
    const records = await this.prisma.payroll.findMany({
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

    if (records.length === 0) return [];

    const staffUserIds = Array.from(new Set(records.map((r) => r.staffUserId)));
    const [staffList, teachers, salaryProfiles, users] = await Promise.all([
      this.prisma.staff?.findMany
        ? this.prisma.staff.findMany({
            where: { tenantId, OR: [{ id: { in: staffUserIds } }, { employeeNumber: { in: staffUserIds } }] },
            include: { department: true, designation: true },
          })
        : Promise.resolve([]),
      this.prisma.teacher?.findMany
        ? this.prisma.teacher.findMany({
            where: { tenantId, OR: [{ id: { in: staffUserIds } }, { employeeNumber: { in: staffUserIds } }] },
            include: { department: true, designation: true },
          })
        : Promise.resolve([]),
      this.prisma.staffSalaryProfile.findMany({
        where: { tenantId, staffUserId: { in: staffUserIds } },
      }),
      this.prisma.user.findMany({
        where: { id: { in: staffUserIds } },
      }),
    ]);

    const staffMap = new Map<string, any>();
    for (const s of staffList) {
      staffMap.set(s.id, s);
      if (s.employeeNumber) staffMap.set(s.employeeNumber, s);
    }
    for (const t of teachers) {
      if (!staffMap.has(t.id)) staffMap.set(t.id, t);
      if (t.employeeNumber && !staffMap.has(t.employeeNumber)) staffMap.set(t.employeeNumber, t);
    }

    const profileMap = new Map<string, any>();
    for (const sp of salaryProfiles) {
      profileMap.set(sp.staffUserId, sp);
    }

    const userMap = new Map<string, any>();
    for (const u of users) {
      userMap.set(u.id, u);
    }

    return records.map((p) => {
      const staffObj = staffMap.get(p.staffUserId);
      const profile = profileMap.get(p.staffUserId);
      const user = userMap.get(p.staffUserId);

      const resolvedStaffName = staffObj
        ? ((staffObj as any).fullName || `${staffObj.firstName || ''} ${staffObj.lastName || ''}`.trim())
        : user
        ? `${user.firstName} ${user.lastName}`.trim()
        : `Staff (${p.staffUserId})`;

      const staffName =
        (p as any).staff ||
        (p as any).staffName ||
        resolvedStaffName;
      const staffId = (p as any).staffId || staffObj?.employeeNumber || p.staffUserId;
      const role = (p as any).role || staffObj?.designation?.name || (staffObj as any)?.role || 'Staff Member';
      const department = (p as any).department || staffObj?.department?.name || (staffObj as any)?.department || 'General';
      const basic = p.basicSalary ?? 0;
      const allowances = (p.housingAllowance || 0) + (p.transportAllowance || 0) + (p.otherAllowances || 0);
      const deductions = p.totalDeductions ?? 0;
      const net = p.netSalary ?? (basic + allowances - deductions);
      const bank = (p as any).bank || profile?.bankName || 'Zenith Bank Plc';
      const accountNumber = (p as any).accountNumber || profile?.accountNumber || '1029384756';

      const monthName =
        typeof p.month === 'number'
          ? [
              'January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December',
            ][p.month - 1]
          : p.month;
      const monthDisplay = p.year ? `${monthName} ${p.year}` : monthName;

      const allowanceBreakdown = [
        { name: 'Housing Allowance', amount: p.housingAllowance || 0 },
        { name: 'Transport Subsidy', amount: p.transportAllowance || 0 },
        { name: 'Special / Duty Allowance', amount: p.otherAllowances || 0 },
      ].filter((a) => a.amount > 0);

      const deductionBreakdown = [
        { name: 'PAYE Income Tax', amount: p.payeTax || 0 },
        { name: 'Contributory Pension (8%)', amount: p.pensionEmployee || 0 },
        { name: 'National Housing Fund (2.5%)', amount: p.nhf || 0 },
        { name: 'NHIS Health Insurance', amount: p.nhis || 0 },
        { name: 'Other Custom Deductions', amount: p.otherDeductions || 0 },
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
        year: p.year,
        status: p.status || 'DRAFT',
        allowanceBreakdown:
          allowanceBreakdown.length > 0
            ? allowanceBreakdown
            : [{ name: 'Standard Allowances', amount: allowances }],
        deductionBreakdown:
          deductionBreakdown.length > 0
            ? deductionBreakdown
            : [{ name: 'Statutory Deductions', amount: deductions }],
      };
    });
  }

  async getPayrollById(tenantId: string, id: string) {
    const record = await this.prisma.payroll.findFirst({
      where: { id, tenantId },
      include: { campus: { select: { id: true, name: true } } },
    });
    if (!record) throw new NotFoundException(`Payroll record "${id}" not found.`);

    const [staffObj, teacher, profile, user] = await Promise.all([
      this.prisma.staff?.findFirst
        ? this.prisma.staff.findFirst({
            where: { tenantId, OR: [{ id: record.staffUserId }, { employeeNumber: record.staffUserId }] },
            include: { department: true, designation: true },
          })
        : Promise.resolve(null),
      this.prisma.teacher?.findFirst
        ? this.prisma.teacher.findFirst({
            where: { tenantId, OR: [{ id: record.staffUserId }, { employeeNumber: record.staffUserId }] },
            include: { department: true, designation: true },
          })
        : Promise.resolve(null),
      this.prisma.staffSalaryProfile.findFirst({
        where: { tenantId, staffUserId: record.staffUserId },
      }),
      this.prisma.user.findUnique({
        where: { id: record.staffUserId },
      }),
    ]);

    const resolvedStaff: any = staffObj || teacher;
    const resolvedStaffName = resolvedStaff
      ? (resolvedStaff.fullName || `${resolvedStaff.firstName || ''} ${resolvedStaff.lastName || ''}`.trim())
      : user
      ? `${user.firstName} ${user.lastName}`.trim()
      : `Staff (${record.staffUserId})`;

    const staffName =
      (record as any).staff ||
      (record as any).staffName ||
      resolvedStaffName;
    const staffId = (record as any).staffId || resolvedStaff?.employeeNumber || record.staffUserId;
    const role = (record as any).role || resolvedStaff?.designation?.name || (resolvedStaff as any)?.role || 'Staff Member';
    const department = (record as any).department || resolvedStaff?.department?.name || (resolvedStaff as any)?.department || 'General';
    const basic = record.basicSalary ?? 0;
    const allowances = (record.housingAllowance || 0) + (record.transportAllowance || 0) + (record.otherAllowances || 0);
    const deductions = record.totalDeductions ?? 0;
    const net = record.netSalary ?? (basic + allowances - deductions);
    const bank = (record as any).bank || profile?.bankName || 'Zenith Bank Plc';
    const accountNumber = (record as any).accountNumber || profile?.accountNumber || '1029384756';

    const monthName =
      typeof record.month === 'number'
        ? [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December',
          ][record.month - 1]
        : record.month;
    const monthDisplay = record.year ? `${monthName} ${record.year}` : monthName;

    return {
      ...record,
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
      gross: record.grossSalary || basic + allowances,
      grossSalary: record.grossSalary || basic + allowances,
      bank,
      accountNumber,
      month: monthDisplay,
      year: record.year,
      status: record.status || 'DRAFT',
      allowanceBreakdown: [
        { name: 'Housing Allowance', amount: record.housingAllowance || 0 },
        { name: 'Transport Subsidy', amount: record.transportAllowance || 0 },
        { name: 'Special / Duty Allowance', amount: record.otherAllowances || 0 },
      ].filter((a) => a.amount > 0),
      deductionBreakdown: [
        { name: 'PAYE Income Tax', amount: record.payeTax || 0 },
        { name: 'Contributory Pension (8%)', amount: record.pensionEmployee || 0 },
        { name: 'National Housing Fund (2.5%)', amount: record.nhf || 0 },
        { name: 'NHIS Health Insurance', amount: record.nhis || 0 },
        { name: 'Other Custom Deductions', amount: record.otherDeductions || 0 },
      ].filter((d) => d.amount > 0),
    };
  }

  async generatePayroll(tenantId: string, dto: GenerateStaffPayrollDto) {
    // 1. Calculate statutory deductions & breakdown
    const breakdown = NigerianTaxCalculator.calculate(dto);

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

  async approvePayroll(tenantId: string, id: string) {
    const record = await this.prisma.payroll.findFirst({ where: { id, tenantId } });
    if (!record) throw new NotFoundException(`Payroll record "${id}" not found.`);
    return this.prisma.payroll.update({
      where: { id },
      data: { status: 'APPROVED' },
    });
  }

  async markPaid(tenantId: string, id: string, paymentReference?: string) {
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
}
