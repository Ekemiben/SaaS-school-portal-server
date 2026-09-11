import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ParentsService } from './parents.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @RequirePermissions(SystemPermissions.PARENTS_VIEW)
  @Get()
  async listParents(@CurrentTenant() tenant: TenantContext) {
    return this.parentsService.findAll(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.PARENTS_VIEW)
  @Get(':id')
  async getParent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.parentsService.findById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.PARENTS_MANAGE)
  @Post()
  async createParent(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.parentsService.create(tenant.tenantId, body);
  }
}
