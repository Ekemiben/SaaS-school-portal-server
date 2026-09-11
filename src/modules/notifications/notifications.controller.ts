import { Controller, Get, Post, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    return this.notificationsService.list(tenant.tenantId, user?.id);
  }

  @RequirePermissions(SystemPermissions.NOTIFICATIONS_SEND)
  @Post('send')
  async send(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.notificationsService.send(tenant.tenantId, body);
  }
}
