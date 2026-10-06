import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { StaffMasterDataService } from '../services/staff-master-data.service.js';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequireAnyPermission } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';

@Controller(['api/v1/teachers/departments', 'api/v1/academics/departments', 'teachers/departments', 'academics/departments'])
export class DepartmentsController {
  constructor(private readonly masterDataService: StaffMasterDataService) {}

  @Get()
  async listDepartments(@CurrentTenant() tenant: TenantContext) {
    return this.masterDataService.listDepartments(tenant.tenantId);
  }

  @Get(':id')
  async getDepartment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.masterDataService.getDepartmentById(tenant.tenantId, id);
  }

  @RequireAnyPermission(SystemPermissions.TEACHERS_MANAGE, SystemPermissions.ACADEMICS_MANAGE)
  @Post()
  async createDepartment(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { name: string; code?: string; description?: string; headStaffId?: string },
  ) {
    return this.masterDataService.createDepartment(tenant.tenantId, body);
  }

  @RequireAnyPermission(SystemPermissions.TEACHERS_MANAGE, SystemPermissions.ACADEMICS_MANAGE)
  @Patch(':id')
  async updateDepartment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { name?: string; code?: string; description?: string; headStaffId?: string | null },
  ) {
    return this.masterDataService.updateDepartment(tenant.tenantId, id, body);
  }

  @RequireAnyPermission(SystemPermissions.TEACHERS_MANAGE, SystemPermissions.ACADEMICS_MANAGE)
  @Delete(':id')
  async deleteDepartment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.masterDataService.deleteDepartment(tenant.tenantId, id);
  }
}

