import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { CampusesService } from './campuses.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/campuses')
export class CampusesController {
  constructor(private readonly campusesService: CampusesService) {}

  @Get()
  async listCampuses(@CurrentTenant() tenant: TenantContext) {
    return this.campusesService.findAll(tenant.tenantId);
  }

  @Get(':id')
  async getCampus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.campusesService.findById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.CAMPUSES_MANAGE)
  @Post()
  async createCampus(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.campusesService.create(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.CAMPUSES_MANAGE)
  @Patch(':id')
  async updateCampus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.campusesService.update(tenant.tenantId, id, body);
  }
}
