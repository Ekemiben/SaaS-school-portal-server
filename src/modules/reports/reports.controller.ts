import { Controller, Get } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @RequirePermissions(SystemPermissions.REPORTS_VIEW)
  @Get('dashboard')
  async getDashboard(@CurrentTenant() tenant: TenantContext) {
    return this.reportsService.getExecutiveDashboard(tenant.tenantId);
  }
}
