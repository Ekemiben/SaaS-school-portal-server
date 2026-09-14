import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { InventoryAnalyticsService } from '../services/inventory-analytics.service.js';

@Controller('api/v1/inventory/analytics')
export class InventoryAnalyticsController {
  constructor(private readonly analyticsService: InventoryAnalyticsService) {}

  @Get('summary')
  @RequirePermissions(SystemPermissions.INVENTORY_VIEW)
  getInventorySummary(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.analyticsService.getInventorySummary(
      tenant.tenantId,
      campusId || tenant.campusIds?.[0],
    );
  }
}
