import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ExaminationsService } from './examinations.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/examinations')
export class ExaminationsController {
  constructor(private readonly examinationsService: ExaminationsService) {}

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Get()
  async listExams(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.examinationsService.findAll(tenant.tenantId, campusId);
  }

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Get(':id')
  async getExam(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.examinationsService.findById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Post()
  async createExam(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.examinationsService.create(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.RESULTS_PUBLISH)
  @Post(':id/publish')
  async publishExam(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.examinationsService.publish(tenant.tenantId, id);
  }

  @Get('grading/scales')
  async getGradingScales(@CurrentTenant() tenant: TenantContext) {
    return this.examinationsService.getGradingScales(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Post('grading/scales')
  async createGradingScale(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { name: string; rules: any[] },
  ) {
    return this.examinationsService.createGradingScale(tenant.tenantId, body);
  }
}
