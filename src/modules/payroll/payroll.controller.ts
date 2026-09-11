import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { PayrollService } from './payroll.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('month') month?: number,
    @Query('year') year?: number,
  ) {
    return this.payrollService.listPayroll(tenant.tenantId, month, year);
  }

  @RequirePermissions(SystemPermissions.PAYROLL_MANAGE)
  @Post('generate')
  async generate(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
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
  @Post(':id/pay')
  async pay(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.payrollService.markPaid(tenant.tenantId, id);
  }
}
