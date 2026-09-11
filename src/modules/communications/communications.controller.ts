import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CommunicationsService } from './communications.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { CreateAnnouncementDto, SendDirectMessageDto } from './dto/create-announcement.dto.js';

@Controller('api/v1/communications')
export class CommunicationsController {
  constructor(private readonly commsService: CommunicationsService) {}

  @Post('announcements')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_MANAGE)
  createAnnouncement(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.commsService.createAnnouncement(tenant.tenantId, user?.sub || 'user_demo', dto);
  }

  @Get('announcements')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  getAnnouncements(
    @CurrentTenant() tenant: TenantContext,
    @Query('audience') audience?: string,
    @Query('campusId') campusId?: string,
  ) {
    return this.commsService.getAnnouncements(tenant.tenantId, audience, campusId);
  }

  @Post('messages')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  sendMessage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.commsService.sendDirectMessage(tenant.tenantId, user?.sub || 'user_demo', dto);
  }

  @Get('threads')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  getUserThreads(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    return this.commsService.getUserThreads(tenant.tenantId, user?.sub || 'user_demo');
  }

  @Get('threads/:threadId')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  getThreadMessages(
    @CurrentTenant() tenant: TenantContext,
    @Param('threadId') threadId: string,
  ) {
    return this.commsService.getThreadMessages(tenant.tenantId, threadId);
  }
}
