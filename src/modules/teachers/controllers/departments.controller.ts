import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { StaffMasterDataService } from '../services/staff-master-data.service.js';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';

@Controller('api/v1/teachers/departments')
export class DepartmentsController {
  constructor(private readonly masterDataService: StaffMasterDataService) {}

  @RequirePermissions(SystemPermissions.TEACHERS_VIEW)
  @Get()
  async listDepartments(@CurrentTenant() tenant: TenantContext) {
    return this.masterDataService.listDepartments(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_VIEW)
  @Get(':id')
  async getDepartment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.masterDataService.getDepartmentById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Post()
  async createDepartment(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { name: string; code?: string; description?: string; headStaffId?: string },
  ) {
    return this.masterDataService.createDepartment(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Patch(':id')
  async updateDepartment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { name?: string; code?: string; description?: string; headStaffId?: string | null },
  ) {
    return this.masterDataService.updateDepartment(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Delete(':id')
  async deleteDepartment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.masterDataService.deleteDepartment(tenant.tenantId, id);
  }
}
