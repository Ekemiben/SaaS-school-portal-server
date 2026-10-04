import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { StaffMasterDataService } from '../services/staff-master-data.service.js';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';

@Controller(['api/v1/teachers/designations', 'api/v1/academics/designations', 'teachers/designations', 'academics/designations'])
export class DesignationsController {
  constructor(private readonly masterDataService: StaffMasterDataService) {}

  @RequirePermissions(SystemPermissions.TEACHERS_VIEW)
  @Get()
  async listDesignations(@CurrentTenant() tenant: TenantContext) {
    return this.masterDataService.listDesignations(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_VIEW)
  @Get(':id')
  async getDesignation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.masterDataService.getDesignationById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Post()
  async createDesignation(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { name: string; code?: string; description?: string; level?: number },
  ) {
    return this.masterDataService.createDesignation(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Patch(':id')
  async updateDesignation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { name?: string; code?: string; description?: string; level?: number },
  ) {
    return this.masterDataService.updateDesignation(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Delete(':id')
  async deleteDesignation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.masterDataService.deleteDesignation(tenant.tenantId, id);
  }
}
