import { Controller, Get } from '@nestjs/common';
import { RolesService } from './roles.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';

@Controller('api/v1/roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async listRoles(@CurrentTenant() tenant: TenantContext) {
    return this.rolesService.listRoles(tenant.tenantId);
  }

  @Get('permissions')
  async listPermissions() {
    return this.rolesService.listPermissions();
  }
}
