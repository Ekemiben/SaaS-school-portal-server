import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import { NigerianTaxCalculator } from './calculator/nigerian-tax-calculator.js';
import {
  UpsertStaffSalaryProfileDto,
  GenerateBulkPayrollDto,
  BulkApprovePayrollDto,
  QueryStaffSalaryProfilesDto,
} from './dto/payroll-bulk.dto.js';

@Injectable()
export class BulkPayrollService {
  private readonly logger = new Logger(BulkPayrollService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertStaffSalaryProfile(tenantId: string, dto: UpsertStaffSalaryProfileDto) {
    if (this.prisma.isDbConnected) {
      return this.prisma.staffSalaryProfile.upsert({
        where: {
          tenantId_staffUserId: { tenantId, staffUserId: dto.staffUserId },
        },
        create: {
          tenantId,
          campusId: dto.campusId,
          staffUserId: dto.staffUserId,
          basicSalary: dto.basicSalary,
          housingAllowance: dto.housingAllowance ?? 0,
          transportAllowance: dto.transportAllowance ?? 0,
          otherAllowances: dto.otherAllowances ?? 0,
          customDeductions: dto.customDeductions ?? 0,
          isPensionExempt: dto.isPensionExempt ?? false,
          isNhfExempt: dto.isNhfExempt ?? false,
          isNhisExempt: dto.isNhisExempt ?? true,
          isTaxExempt: dto.isTaxExempt ?? false,
          bankCode: dto.bankCode,
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          accountName: dto.accountName,
          isActive: dto.isActive ?? true,
        },
        update: {
          campusId: dto.campusId,
          basicSalary: dto.basicSalary,
          housingAllowance: dto.housingAllowance ?? 0,
          transportAllowance: dto.transportAllowance ?? 0,
          otherAllowances: dto.otherAllowances ?? 0,
          customDeductions: dto.customDeductions ?? 0,
          isPensionExempt: dto.isPensionExempt ?? false,
          isNhfExempt: dto.isNhfExempt ?? false,
          isNhisExempt: dto.isNhisExempt ?? true,
          isTaxExempt: dto.isTaxExempt ?? false,
          bankCode: dto.bankCode,
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          accountName: dto.accountName,
          isActive: dto.isActive ?? true,
        },
      });
    }

    const key = `${tenantId}_${dto.staffUserId}`;
    let profile = this.prisma.memoryStore.staffSalaryProfiles?.get(key);
    const data = {
      id: profile?.id || `ssp_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
      tenantId,
      campusId: dto.campusId,
      staffUserId: dto.staffUserId,
      basicSalary: dto.basicSalary,
      housingAllowance: dto.housingAllowance ?? 0,
      transportAllowance: dto.transportAllowance ?? 0,
      otherAllowances: dto.otherAllowances ?? 0,
      customDeductions: dto.customDeductions ?? 0,
      isPensionExempt: dto.isPensionExempt ?? false,
      isNhfExempt: dto.isNhfExempt ?? false,
      isNhisExempt: dto.isNhisExempt ?? true,
      isTaxExempt: dto.isTaxExempt ?? false,
      bankCode: dto.bankCode,
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      accountName: dto.accountName,
      isActive: dto.isActive ?? true,
      updatedAt: new Date(),
      createdAt: profile?.createdAt || new Date(),
    };
    this.prisma.memoryStore.staffSalaryProfiles.set(key, data);
    return data;
  }

  async getStaffSalaryProfile(tenantId: string, staffUserId: string) {
    if (this.prisma.isDbConnected) {
      const profile = await this.prisma.staffSalaryProfile.findFirst({
        where: { tenantId, staffUserId },
        include: { campus: { select: { id: true, name: true } } },
      });
      if (!profile) throw new NotFoundException(`Salary profile for staff "${staffUserId}" not found.`);
      return profile;
    }

    const profile = this.prisma.memoryStore.staffSalaryProfiles?.get(`${tenantId}_${staffUserId}`);
    if (!profile || profile.tenantId !== tenantId) {
      throw new NotFoundException('Salary profile not found.');
    }
    return profile;
  }

  async listStaffSalaryProfiles(tenantId: string, query?: QueryStaffSalaryProfilesDto) {
    if (this.prisma.isDbConnected) {
      return this.prisma.staffSalaryProfile.findMany({
        where: {
          tenantId,
          ...(query?.campusId && { campusId: query.campusId }),
          ...(query?.isActive !== undefined && { isActive: query.isActive }),
        },
        include: { campus: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
    }

    return Array.from(this.prisma.memoryStore.staffSalaryProfiles.values()).filter((p: any) => {
      if (p.tenantId !== tenantId) return false;
      if (query?.campusId && p.campusId !== query.campusId) return false;
      if (query?.isActive !== undefined && p.isActive !== query.isActive) return false;
      return true;
    });
  }

  async generateBulkPayroll(tenantId: string, dto: GenerateBulkPayrollDto) {
    // 1. Fetch eligible staff salary profiles
    const profiles = await this.listStaffSalaryProfiles(tenantId, {
      campusId: dto.campusId,
      isActive: true,
    });

    const createdRecords: any[] = [];
    const skippedRecords: any[] = [];

    let totalGross = 0;
    let totalNet = 0;
    let totalPaye = 0;
    let totalPensionEmployee = 0;
    let totalPensionEmployer = 0;
    let totalNhf = 0;
    let totalEmployerCost = 0;

    for (const profile of profiles) {
      try {
        const breakdown = NigerianTaxCalculator.calculate({
          basicSalary: profile.basicSalary,
          housingAllowance: profile.housingAllowance,
          transportAllowance: profile.transportAllowance,
          otherAllowances: profile.otherAllowances,
          customDeductions: profile.customDeductions,
          isPensionExempt: profile.isPensionExempt,
          isNhfExempt: profile.isNhfExempt,
          isNhisExempt: profile.isNhisExempt,
          isTaxExempt: profile.isTaxExempt,
        });

        if (this.prisma.isDbConnected) {
          const existing = await this.prisma.payroll.findFirst({
            where: {
              tenantId,
              staffUserId: profile.staffUserId,
              month: Number(dto.month),
              year: Number(dto.year),
            },
          });

          if (existing && !dto.overrideExisting) {
            skippedRecords.push({ staffUserId: profile.staffUserId, reason: 'Already exists for this period' });
            continue;
          }

          let record: any;
          if (existing && dto.overrideExisting) {
            record = await this.prisma.payroll.update({
              where: { id: existing.id },
              data: {
                campusId: profile.campusId,
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
                notes: dto.notes,
                breakdown: breakdown as any,
              },
            });
          } else {
            record = await this.prisma.payroll.create({
              data: {
                tenantId,
                campusId: profile.campusId,
                staffUserId: profile.staffUserId,
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

          createdRecords.push(record);
        } else {
          // Memory store
          const existing = Array.from(this.prisma.memoryStore.payroll.values()).find(
            (p: any) =>
              p.tenantId === tenantId &&
              p.staffUserId === profile.staffUserId &&
              p.month === Number(dto.month) &&
              p.year === Number(dto.year),
          );

          if (existing && !dto.overrideExisting) {
            skippedRecords.push({ staffUserId: profile.staffUserId, reason: 'Already exists for this period' });
            continue;
          }

          const id = existing?.id || `pay_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
          const record = {
            id,
            tenantId,
            campusId: profile.campusId,
            staffUserId: profile.staffUserId,
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
            breakdown,
            createdAt: existing?.createdAt || new Date(),
          };

          this.prisma.memoryStore.payroll.set(id, record);
          createdRecords.push(record);
        }

        totalGross += breakdown.grossSalary;
        totalNet += breakdown.netSalary;
        totalPaye += breakdown.payeTax;
        totalPensionEmployee += breakdown.pensionEmployee;
        totalPensionEmployer += breakdown.pensionEmployer;
        totalNhf += breakdown.nhf;
        totalEmployerCost += breakdown.totalEmployerCost;
      } catch (err: any) {
        this.logger.error(`Error calculating payroll for staff ${profile.staffUserId}: ${err?.message}`);
        skippedRecords.push({ staffUserId: profile.staffUserId, reason: err?.message });
      }
    }

    return {
      month: Number(dto.month),
      year: Number(dto.year),
      campusId: dto.campusId || null,
      totalEligibleStaff: profiles.length,
      totalGenerated: createdRecords.length,
      totalSkipped: skippedRecords.length,
      summary: {
        totalGross: Math.round(totalGross * 100) / 100,
        totalNet: Math.round(totalNet * 100) / 100,
        totalPaye: Math.round(totalPaye * 100) / 100,
        totalPensionEmployee: Math.round(totalPensionEmployee * 100) / 100,
        totalPensionEmployer: Math.round(totalPensionEmployer * 100) / 100,
        totalNhf: Math.round(totalNhf * 100) / 100,
        totalEmployerCost: Math.round(totalEmployerCost * 100) / 100,
      },
      records: createdRecords,
      skipped: skippedRecords,
    };
  }

  async bulkApprovePayroll(tenantId: string, dto: BulkApprovePayrollDto) {
    if (this.prisma.isDbConnected) {
      const result = await this.prisma.payroll.updateMany({
        where: {
          tenantId,
          month: Number(dto.month),
          year: Number(dto.year),
          status: 'DRAFT',
          ...(dto.campusId && { campusId: dto.campusId }),
        },
        data: { status: 'APPROVED' },
      });
      return { month: dto.month, year: dto.year, approvedCount: result.count };
    }

    let count = 0;
    for (const record of this.prisma.memoryStore.payroll.values()) {
      if (
        record.tenantId === tenantId &&
        record.month === Number(dto.month) &&
        record.year === Number(dto.year) &&
        record.status === 'DRAFT' &&
        (!dto.campusId || record.campusId === dto.campusId)
      ) {
        record.status = 'APPROVED';
        count++;
      }
    }
    return { month: dto.month, year: dto.year, approvedCount: count };
  }
}
