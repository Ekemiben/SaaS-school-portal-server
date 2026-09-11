import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { AcademicsService } from './academics.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/academics')
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  @Get('years')
  async getYears(@CurrentTenant() tenant: TenantContext) {
    return this.academicsService.getAcademicYears(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('years')
  async createYear(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.academicsService.createAcademicYear(tenant.tenantId, body);
  }

  @Get('terms')
  async getTerms(
    @CurrentTenant() tenant: TenantContext,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.academicsService.getTerms(tenant.tenantId, academicYearId);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('terms')
  async createTerm(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.academicsService.createTerm(tenant.tenantId, body);
  }

  @Get('classes')
  async getClasses(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.academicsService.getClasses(tenant.tenantId, campusId);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('classes')
  async createClass(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.academicsService.createClass(tenant.tenantId, body);
  }

  @Get('subjects')
  async getSubjects(@CurrentTenant() tenant: TenantContext) {
    return this.academicsService.getSubjects(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('subjects')
  async createSubject(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.academicsService.createSubject(tenant.tenantId, body);
  }
}
