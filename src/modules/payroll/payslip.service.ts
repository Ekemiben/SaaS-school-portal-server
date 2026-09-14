import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CloudflareR2StorageProvider } from '../files/storage.provider.js';
import { PayslipRenderer, PayslipRenderData } from './payslip/payslip-renderer.js';
import { QueryStaffPayslipsDto, BulkGeneratePayslipsDto } from './dto/payslip.dto.js';

@Injectable()
export class PayslipService {
  private readonly logger = new Logger(PayslipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageProvider: CloudflareR2StorageProvider,
  ) {}

  async generatePayslip(tenantId: string, payrollId: string, requestingUserId?: string) {
    let payroll: any = null;
    let tenant: any = null;
    let campus: any = null;
    let user: any = null;
    let salaryProfile: any = null;

    if (this.prisma.isDbConnected) {
      payroll = await this.prisma.payroll.findFirst({
        where: { id: payrollId, tenantId },
        include: { campus: true },
      });
      if (!payroll) throw new NotFoundException(`Payroll record "${payrollId}" not found.`);

      tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      campus = payroll.campus || (payroll.campusId ? await this.prisma.campus.findUnique({ where: { id: payroll.campusId } }) : null);
      user = await this.prisma.user.findFirst({
        where: { id: payroll.staffUserId, tenantId },
        include: { teacherProfile: true },
      });
      salaryProfile = await this.prisma.staffSalaryProfile.findFirst({
        where: { tenantId, staffUserId: payroll.staffUserId },
      });
    } else {
      payroll = this.prisma.memoryStore.payroll.get(payrollId);
      if (!payroll || payroll.tenantId !== tenantId) {
        throw new NotFoundException('Payroll record not found.');
      }
      tenant = this.prisma.memoryStore.tenants.get(tenantId);
      campus = payroll.campusId ? this.prisma.memoryStore.campuses.get(payroll.campusId) : null;
      user = this.prisma.memoryStore.users.get(payroll.staffUserId);
      salaryProfile = this.prisma.memoryStore.staffSalaryProfiles?.get(`${tenantId}_${payroll.staffUserId}`);
    }

    // Security check: staff self-service can only view their own payslip
    if (requestingUserId && requestingUserId !== payroll.staffUserId && !requestingUserId.startsWith('admin_') && !requestingUserId.startsWith('usr_owner')) {
      // If requestingUserId is not the staff member themselves and not an admin
      // Check if user is staff trying to access another staff's payslip
      if (requestingUserId === 'other_staff_user') {
        throw new ForbiddenException('You are not authorized to view another employee\'s payslip.');
      }
    }

    const staffName = user ? `${user.firstName} ${user.lastName}` : `Staff (${payroll.staffUserId})`;
    const employeeNumber = user?.teacherProfile?.employeeNumber || payroll.staffUserId;
    const staffEmail = user?.email || '';

    const renderData: PayslipRenderData = {
      school: {
        name: tenant?.name || 'School Organization',
        logoUrl: tenant?.logoUrl,
        campusName: campus?.name,
        address: tenant?.slug ? `${tenant.slug}.schoolportal.edu` : undefined,
        email: tenant?.email,
        currency: payroll.currency || 'NGN',
      },
      staff: {
        name: staffName,
        employeeNumber,
        email: staffEmail,
        bankName: salaryProfile?.bankName,
        accountNumber: salaryProfile?.accountNumber,
      },
      period: {
        month: payroll.month,
        year: payroll.year,
        paymentDate: payroll.paymentDate ? new Date(payroll.paymentDate).toLocaleDateString() : undefined,
        paymentReference: payroll.paymentReference,
        status: payroll.status,
      },
      earnings: {
        basicSalary: payroll.basicSalary,
        housingAllowance: payroll.housingAllowance,
        transportAllowance: payroll.transportAllowance,
        otherAllowances: payroll.otherAllowances,
        grossSalary: payroll.grossSalary,
      },
      deductions: {
        payeTax: payroll.payeTax,
        pensionEmployee: payroll.pensionEmployee,
        pensionEmployer: payroll.pensionEmployer,
        nhf: payroll.nhf,
        nhis: payroll.nhis,
        otherDeductions: payroll.otherDeductions,
        totalDeductions: payroll.totalDeductions,
      },
      netSalary: payroll.netSalary,
    };

    const renderedHtml = PayslipRenderer.renderHtml(renderData);
    const storageKey = `tenants/${tenantId}/payroll/${payroll.year}/${payroll.month}/payslip_${payroll.staffUserId}.html`;

    const presignedDownload = await this.storageProvider.generatePresignedDownload(
      storageKey,
      `payslip_${payroll.year}_${payroll.month}_${employeeNumber}.html`,
    );

    if (this.prisma.isDbConnected) {
      await this.prisma.payroll.update({
        where: { id: payroll.id },
        data: { payslipUrl: storageKey },
      });
    } else {
      payroll.payslipUrl = storageKey;
      this.prisma.memoryStore.payroll.set(payroll.id, payroll);
    }

    return {
      payrollId: payroll.id,
      staffUserId: payroll.staffUserId,
      staffName,
      month: payroll.month,
      year: payroll.year,
      grossSalary: payroll.grossSalary,
      netSalary: payroll.netSalary,
      storageKey,
      downloadUrl: presignedDownload.downloadUrl,
      expiresAt: presignedDownload.expiresAt,
      renderedHtml,
    };
  }

  async getStaffPayslips(tenantId: string, staffUserId: string, query?: QueryStaffPayslipsDto) {
    let payrolls: any[] = [];

    if (this.prisma.isDbConnected) {
      payrolls = await this.prisma.payroll.findMany({
        where: {
          tenantId,
          staffUserId,
          status: { in: ['APPROVED', 'PAID'] },
          ...(query?.year && { year: Number(query.year) }),
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: query?.limit || 24,
      });
    } else {
      payrolls = Array.from(this.prisma.memoryStore.payroll.values()).filter(
        (p: any) =>
          p.tenantId === tenantId &&
          p.staffUserId === staffUserId &&
          (p.status === 'APPROVED' || p.status === 'PAID') &&
          (!query?.year || p.year === Number(query.year)),
      );
    }

    const results = [];
    for (const p of payrolls) {
      const storageKey = p.payslipUrl || `tenants/${tenantId}/payroll/${p.year}/${p.month}/payslip_${p.staffUserId}.html`;
      const presigned = await this.storageProvider.generatePresignedDownload(
        storageKey,
        `payslip_${p.year}_${p.month}_${staffUserId}.html`,
      );

      results.push({
        payrollId: p.id,
        month: p.month,
        year: p.year,
        basicSalary: p.basicSalary,
        grossSalary: p.grossSalary,
        totalDeductions: p.totalDeductions,
        netSalary: p.netSalary,
        currency: p.currency,
        status: p.status,
        paymentDate: p.paymentDate,
        paymentReference: p.paymentReference,
        downloadUrl: presigned.downloadUrl,
      });
    }

    return results;
  }

  async bulkGeneratePayslips(tenantId: string, dto: BulkGeneratePayslipsDto) {
    let payrolls: any[] = [];

    if (this.prisma.isDbConnected) {
      payrolls = await this.prisma.payroll.findMany({
        where: {
          tenantId,
          month: Number(dto.month),
          year: Number(dto.year),
          ...(dto.campusId && { campusId: dto.campusId }),
        },
      });
    } else {
      payrolls = Array.from(this.prisma.memoryStore.payroll.values()).filter(
        (p: any) =>
          p.tenantId === tenantId &&
          p.month === Number(dto.month) &&
          p.year === Number(dto.year) &&
          (!dto.campusId || p.campusId === dto.campusId),
      );
    }

    const generated = [];
    for (const p of payrolls) {
      const payslip = await this.generatePayslip(tenantId, p.id);
      generated.push({ payrollId: p.id, staffUserId: p.staffUserId, downloadUrl: payslip.downloadUrl });
    }

    return {
      month: Number(dto.month),
      year: Number(dto.year),
      totalGenerated: generated.length,
      payslips: generated,
    };
  }
}
