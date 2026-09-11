import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { RolesService } from './roles.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions(SystemPermissions.ROLES_MANAGE)
  async listRoles(@CurrentTenant() tenant: TenantContext) {
    return this.rolesService.listRoles(tenant.tenantId);
  }

  @Post()
  @RequirePermissions(SystemPermissions.ROLES_MANAGE)
  async createRole(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { name: string; description?: string; permissions: string[] },
  ) {
    return this.rolesService.createRole(tenant.tenantId, body);
  }

  @Patch(':id')
  @RequirePermissions(SystemPermissions.ROLES_MANAGE)
  async updateRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; permissions?: string[] },
  ) {
    return this.rolesService.updateRole(tenant.tenantId, id, body);
  }

  @Delete(':id')
  @RequirePermissions(SystemPermissions.ROLES_MANAGE)
  async deleteRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.rolesService.deleteRole(tenant.tenantId, id);
  }

  @Get('permissions')
  @RequirePermissions(SystemPermissions.ROLES_MANAGE)
  async listPermissions() {
    return this.rolesService.listPermissions();
  }
}
