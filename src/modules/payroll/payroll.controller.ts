import { Controller, Get, Post, Param, Body, Query, Headers, Req } from '@nestjs/common';
import { PayrollService } from './payroll.service.js';
import { BulkPayrollService } from './bulk-payroll.service.js';
import { PayrollDisbursementService } from './payroll-disbursement.service.js';
import { PayslipService } from './payslip.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import {
  CalculateSalaryDto,
  GenerateStaffPayrollDto,
  QueryPayrollDto,
} from './dto/payroll-calculation.dto.js';
import {
  UpsertStaffSalaryProfileDto,
  GenerateBulkPayrollDto,
  BulkApprovePayrollDto,
  QueryStaffSalaryProfilesDto,
} from './dto/payroll-bulk.dto.js';
import {
  DisburseIndividualPayrollDto,
  BulkDisbursePayrollDto,
} from './dto/payroll-disbursement.dto.js';
import { QueryStaffPayslipsDto, BulkGeneratePayslipsDto } from './dto/payslip.dto.js';

@Controller('api/v1/payroll')
export class PayrollController {
  constructor(
    private readonly payrollService: PayrollService,
    private readonly bulkPayrollService: BulkPayrollService,
    private readonly disbursementService: PayrollDisbursementService,
    private readonly payslipService: PayslipService,
  ) {}

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Post('calculate')
  async calculate(@Body() body: CalculateSalaryDto) {
    return this.payrollService.calculateSalary(body);
  }

  // --- Salary Profiles ---

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Post('salary-profiles')
  async upsertSalaryProfile(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpsertStaffSalaryProfileDto,
  ) {
    return this.bulkPayrollService.upsertStaffSalaryProfile(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Get('salary-profiles')
  async listSalaryProfiles(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: QueryStaffSalaryProfilesDto,
  ) {
    return this.bulkPayrollService.listStaffSalaryProfiles(tenant.tenantId, query);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Get('salary-profiles/:staffUserId')
  async getSalaryProfile(
    @CurrentTenant() tenant: TenantContext,
    @Param('staffUserId') staffUserId: string,
  ) {
    return this.bulkPayrollService.getStaffSalaryProfile(tenant.tenantId, staffUserId);
  }

  // --- Bulk Payroll Operations ---

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Post('generate/bulk')
  async generateBulk(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: GenerateBulkPayrollDto,
  ) {
    return this.bulkPayrollService.generateBulkPayroll(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Post('approve/bulk')
  async bulkApprove(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: BulkApprovePayrollDto,
  ) {
    return this.bulkPayrollService.bulkApprovePayroll(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Post('disburse/bulk')
  async bulkDisburse(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: BulkDisbursePayrollDto,
  ) {
    return this.disbursementService.bulkDisbursePayroll(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Post('payslips/bulk')
  async bulkGeneratePayslips(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: BulkGeneratePayslipsDto,
  ) {
    return this.payslipService.bulkGeneratePayslips(tenant.tenantId, body);
  }

  // --- Staff Self-Service Payslips ---

  @Get('staff/my-payslips')
  async getMyPayslips(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: QueryStaffPayslipsDto,
  ) {
    return this.payslipService.getStaffPayslips(tenant.tenantId, tenant.userId || '', query);
  }

  // --- Individual Payroll Operations, Disbursement & Payslips ---

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: QueryPayrollDto,
  ) {
    return this.payrollService.listPayroll(tenant.tenantId, query);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Get(':id')
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.payrollService.getPayrollById(tenant.tenantId, id);
  }

  @Get(':id/payslip')
  async getPayslip(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.payslipService.generatePayslip(tenant.tenantId, id, tenant.userId);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Post('generate')
  async generate(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: GenerateStaffPayrollDto,
  ) {
    return this.payrollService.generatePayroll(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Post(':id/approve')
  async approve(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.payrollService.approvePayroll(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Post(':id/disburse')
  async disburse(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: DisburseIndividualPayrollDto,
  ) {
    return this.disbursementService.disbursePayroll(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Get(':id/reconcile')
  async reconcile(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query('provider') provider?: string,
  ) {
    return this.disbursementService.reconcilePayroll(tenant.tenantId, id, provider);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Post(':id/pay')
  async pay(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body('paymentReference') paymentReference?: string,
  ) {
    return this.payrollService.markPaid(tenant.tenantId, id, paymentReference);
  }

  // --- Disbursement Webhooks ---

  @Post('webhooks/:provider')
  async handleWebhook(
    @Param('provider') provider: string,
    @Headers('x-paystack-signature') paystackSig: string,
    @Headers('verif-hash') flutterwaveSig: string,
    @Body() payload: any,
    @Req() req: any,
  ) {
    const signature = paystackSig || flutterwaveSig || '';
    const rawBody = req.rawBody || JSON.stringify(payload);
    return this.disbursementService.processWebhook(provider, signature, payload, rawBody);
  }
}
