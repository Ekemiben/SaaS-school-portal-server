import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
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

  @RequirePermissions(SystemPermissions.REPORTS_VIEW)
  @Get('financial')
  async getFinancialSummary(
    @CurrentTenant() tenant: TenantContext,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getFinancialSummary(tenant.tenantId, startDate, endDate);
  }

  @RequirePermissions(SystemPermissions.REPORTS_VIEW)
  @Get('academics')
  async getAcademicSummary(
    @CurrentTenant() tenant: TenantContext,
    @Query('examinationId') examinationId?: string,
    @Query('termId') termId?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.reportsService.getAcademicSummary(tenant.tenantId, examinationId, termId, academicYearId);
  }

  @RequirePermissions(SystemPermissions.REPORTS_VIEW)
  @Get('attendance')
  async getAttendanceSummary(@CurrentTenant() tenant: TenantContext) {
    return this.reportsService.getAttendanceSummary(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.REPORTS_VIEW)
  @Post('export')
  async queueExport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: { reportType: 'report-card' | 'fee-summary' | 'attendance-sheet'; campusId?: string; parameters?: any },
  ) {
    return this.reportsService.queueExport(tenant.tenantId, user?.id || 'sys_user', body);
  }
}
