import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { FeesService } from './fees.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('structures')
  async listFeeStructures(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.feesService.getFeeStructures(tenant.tenantId, campusId);
  }

  @RequirePermissions(SystemPermissions.FEES_CREATE)
  @Post('structures')
  async createFeeStructure(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.feesService.createFeeStructure(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('invoices')
  async listInvoices(
    @CurrentTenant() tenant: TenantContext,
    @Query('studentId') studentId?: string,
    @Query('status') status?: string,
  ) {
    return this.feesService.getInvoices(tenant.tenantId, { studentId, status });
  }

  @RequirePermissions(SystemPermissions.INVOICES_MANAGE)
  @Post('invoices')
  async generateInvoice(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.feesService.generateInvoice(tenant.tenantId, body);
  }
}
