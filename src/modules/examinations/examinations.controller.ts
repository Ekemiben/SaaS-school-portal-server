import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
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

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Patch(':id')
  async updateExam(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.examinationsService.update(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Delete(':id')
  async deleteExam(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.examinationsService.delete(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.RESULTS_PUBLISH)
  @Post(':id/publish')
  async publishExam(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.examinationsService.publish(tenant.tenantId, id);
  }

  // --- Exam Papers ---
  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Post(':id/papers')
  async addPaper(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') examId: string,
    @Body() body: any,
  ) {
    return this.examinationsService.addPaper(tenant.tenantId, examId, body);
  }

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Patch(':id/papers/:paperId')
  async updatePaper(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') examId: string,
    @Param('paperId') paperId: string,
    @Body() body: any,
  ) {
    return this.examinationsService.updatePaper(tenant.tenantId, examId, paperId, body);
  }

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Delete(':id/papers/:paperId')
  async deletePaper(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') examId: string,
    @Param('paperId') paperId: string,
  ) {
    return this.examinationsService.deletePaper(tenant.tenantId, examId, paperId);
  }

  // --- Grading Scales ---
  @Get('grading/scales')
  async getGradingScales(@CurrentTenant() tenant: TenantContext) {
    return this.examinationsService.getGradingScales(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Post('grading/scales')
  async createGradingScale(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.examinationsService.createGradingScale(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Patch('grading/scales/:id')
  async updateGradingScale(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.examinationsService.updateGradingScale(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Delete('grading/scales/:id')
  async deleteGradingScale(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.examinationsService.deleteGradingScale(tenant.tenantId, id);
  }
}
