import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { TransportService } from './transport.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @Get('routes')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.transportService.listRoutes(tenant.tenantId, campusId);
  }

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Post('routes')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.transportService.createRoute(tenant.tenantId, body);
  }
}
