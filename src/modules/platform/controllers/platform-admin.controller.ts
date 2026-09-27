import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { PlatformAdminService } from '../services/platform-admin.service.js';
import {
  PlatformTenantFilterDto,
  UpdateTenantStatusDto,
  UpdateTenantPlanDto,
  TenantDangerActionDto,
  DeleteTenantDangerDto,
} from '../dto/platform-tenant.dto.js';
import { AuthGuard } from '../../../common/guards/auth.guard.js';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard.js';
import { PermissionsGuard } from '../../../common/guards/permissions.guard.js';

@Controller('api/v1/platform/admin')
@UseGuards(AuthGuard, PlatformAdminGuard, PermissionsGuard)
export class PlatformAdminController {
  constructor(private readonly adminService: PlatformAdminService) {}

  @Get('stats')
  @RequirePermissions(SystemPermissions.PLATFORM_TENANT_VIEW)
  getGlobalStats() {
    return this.adminService.getGlobalStats();
  }

  @Get('tenants')
  @RequirePermissions(SystemPermissions.PLATFORM_TENANT_VIEW)
  listTenants(@Query() filter: PlatformTenantFilterDto) {
    return this.adminService.listTenants(filter);
  }

  @Get('tenants/:id')
  @RequirePermissions(SystemPermissions.PLATFORM_TENANT_VIEW)
  getTenantDetail(@Param('id') tenantId: string) {
    return this.adminService.getTenantDetail(tenantId);
  }

  @Patch('tenants/:id/status')
  @RequirePermissions(SystemPermissions.PLATFORM_TENANT_SUSPEND)
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
  @RequirePermissions(SystemPermissions.PLATFORM_TENANT_UPDATE)
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

  // =========================================================================
  // STEP 13: SUPER ADMIN DANGER ZONE ENDPOINTS
  // =========================================================================

  @Post('tenants/:id/deactivate')
  @RequirePermissions(SystemPermissions.PLATFORM_TENANT_SUSPEND)
  deactivateTenant(
    @Param('id') tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: TenantDangerActionDto,
  ) {
    return this.adminService.deactivateTenant(tenantId, dto?.reason, user);
  }

  @Post('tenants/:id/suspend')
  @RequirePermissions(SystemPermissions.PLATFORM_TENANT_SUSPEND)
  suspendTenant(
    @Param('id') tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: TenantDangerActionDto,
  ) {
    return this.adminService.suspendTenant(tenantId, dto?.reason || 'Administrative Suspension', user);
  }

  @Post('tenants/:id/archive')
  @RequirePermissions(SystemPermissions.PLATFORM_TENANT_SUSPEND)
  archiveTenant(
    @Param('id') tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: TenantDangerActionDto,
  ) {
    return this.adminService.archiveTenant(tenantId, dto?.reason, user);
  }

  @Post('tenants/:id/reactivate')
  @RequirePermissions(SystemPermissions.PLATFORM_TENANT_SUSPEND)
  reactivateTenant(
    @Param('id') tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.adminService.reactivateTenant(tenantId, user);
  }

  @Post('tenants/:id/delete')
  @RequirePermissions(SystemPermissions.PLATFORM_TENANT_DELETE)
  deleteTenantPost(
    @Param('id') tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: DeleteTenantDangerDto,
  ) {
    return this.adminService.deleteTenantDanger(tenantId, dto, user);
  }

  @Delete('tenants/:id')
  @RequirePermissions(SystemPermissions.PLATFORM_TENANT_DELETE)
  deleteTenant(
    @Param('id') tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: DeleteTenantDangerDto,
  ) {
    return this.adminService.deleteTenantDanger(tenantId, dto, user);
  }
}

