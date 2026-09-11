import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermissions(SystemPermissions.USERS_VIEW)
  @Get()
  async listUsers(@CurrentTenant() tenant: TenantContext) {
    return this.usersService.listUsers(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.USERS_VIEW)
  @Get(':id')
  async getUser(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.usersService.getUser(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.USERS_CREATE)
  @Post()
  async createUser(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.usersService.createUser(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.USERS_MANAGE)
  @Patch(':id/roles')
  async updateRoles(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { roles: string[]; permissionIds?: string[] },
  ) {
    return this.usersService.updateUserRoles(tenant.tenantId, id, body.roles, body.permissionIds);
  }
}
