import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { ResultsService } from './results.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/results')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Get()
  async listResults(
    @CurrentTenant() tenant: TenantContext,
    @Query('examinationId') examinationId?: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.resultsService.getResults(tenant.tenantId, { examinationId, studentId });
  }

  @RequirePermissions(SystemPermissions.RESULTS_ENTER)
  @Post('enter')
  async enterMarks(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.resultsService.enterMarks(
      tenant.tenantId,
      user?.id || 'sys_user',
      body,
    );
  }

  @Get('report-card/:studentId/:examinationId')
  async getReportCard(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
    @Param('examinationId') examinationId: string,
  ) {
    return this.resultsService.getReportCard(tenant.tenantId, studentId, examinationId);
  }

  @Get('report-card/:studentId/:examinationId/print')
  async getPrintableReportCard(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
    @Param('examinationId') examinationId: string,
  ) {
    return this.resultsService.getPrintableReportCard(tenant.tenantId, studentId, examinationId);
  }

  @RequirePermissions(SystemPermissions.RESULTS_APPROVE)
  @Post('approve')
  async approveResults(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: { examinationId: string; classId?: string },
  ) {
    return this.resultsService.approveResults(
      tenant.tenantId,
      body.examinationId,
      user?.id || 'sys_user',
      body.classId,
    );
  }

  @RequirePermissions(SystemPermissions.RESULTS_PUBLISH)
  @Post('publish')
  async publishResults(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { examinationId: string; classId?: string },
  ) {
    return this.resultsService.publishResults(tenant.tenantId, body.examinationId, body.classId);
  }
}
