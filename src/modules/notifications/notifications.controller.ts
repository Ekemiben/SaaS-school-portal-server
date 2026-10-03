import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
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
    @Query('isRead') isRead?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (user?.id) {
      return this.notificationsService.listUserInbox(tenant.tenantId, user.id, {
        isRead: isRead !== undefined ? isRead === 'true' : undefined,
        category,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
    }
    return this.notificationsService.list(tenant.tenantId);
  }

  @Get('inbox')
  async listInbox(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Query('isRead') isRead?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.notificationsService.listUserInbox(tenant.tenantId, user.id, {
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
      category,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('unread-count')
  async getUnreadCount(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    const unreadCount = await this.notificationsService.getUnreadCount(
      tenant.tenantId,
      user.id,
    );
    return { unreadCount };
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(tenant.tenantId, user.id, id);
  }

  @Post('mark-all-read')
  async markAllAsRead(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    return this.notificationsService.markAllAsRead(tenant.tenantId, user.id);
  }

  @Delete(':id')
  async archiveInboxItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const success = await this.notificationsService.archiveInboxItem(
      tenant.tenantId,
      user.id,
      id,
    );
    return { success };
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
