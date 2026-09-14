import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { PlatformAdminService } from '../services/platform-admin.service.js';
import {
  PlatformTenantFilterDto,
  UpdateTenantStatusDto,
  UpdateTenantPlanDto,
} from '../dto/platform-tenant.dto.js';

@Controller('api/v1/platform/admin')
export class PlatformAdminController {
  constructor(private readonly adminService: PlatformAdminService) {}

  @Get('stats')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  getGlobalStats() {
    return this.adminService.getGlobalStats();
  }

  @Get('tenants')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  listTenants(@Query() filter: PlatformTenantFilterDto) {
    return this.adminService.listTenants(filter);
  }

  @Get('tenants/:id')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  getTenantDetail(@Param('id') tenantId: string) {
    return this.adminService.getTenantDetail(tenantId);
  }

  @Patch('tenants/:id/status')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  updateTenantStatus(
    @Param('id') tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.adminService.updateTenantStatus(
      tenantId,
      dto,
      user?.id || 'superadmin_system',
    );
  }

  @Patch('tenants/:id/plan')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  updateTenantPlan(
    @Param('id') tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateTenantPlanDto,
  ) {
    return this.adminService.updateTenantPlan(
      tenantId,
      dto,
      user?.id || 'superadmin_system',
    );
  }
}
