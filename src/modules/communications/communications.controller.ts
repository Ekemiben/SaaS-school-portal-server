import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CommunicationsService } from './communications.service.js';
import { CampaignService } from './services/campaign.service.js';
import { AudienceService } from './services/audience.service.js';
import { MessageTemplateService } from './services/message-template.service.js';
import { CommunicationPolicyService } from './services/communication-policy.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { CreateAnnouncementDto, SendDirectMessageDto } from './dto/create-announcement.dto.js';
import { CreateCampaignDto, CampaignFilterDto, CampaignChannel } from './dto/campaign.dto.js';
import { ResolveAudienceDto } from './dto/audience.dto.js';
import { CreateTemplateDto, UpdateTemplateDto, TemplateCategory } from './dto/template.dto.js';
import { UpdateCommunicationSettingsDto } from './dto/communication-settings.dto.js';

@Controller('api/v1/communications')
export class CommunicationsController {
  constructor(
    private readonly commsService: CommunicationsService,
    private readonly campaignService: CampaignService,
    private readonly audienceService: AudienceService,
    private readonly templateService: MessageTemplateService,
    private readonly policyService: CommunicationPolicyService,
  ) {}

  // --- Announcements & Broadcasts ---
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
  getAnnouncements(
    @CurrentTenant() tenant: TenantContext,
    @Query('audience') audience?: string,
    @Query('campusId') campusId?: string,
  ) {
    return this.commsService.getAnnouncements(tenant.tenantId, audience, campusId);
  }

  // --- Omnichannel Campaigns ---
  @Post('campaigns')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_MANAGE)
  createCampaign(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignService.createAndDispatchCampaign(tenant.tenantId, user?.sub || 'user_demo', dto);
  }

  @Get('campaigns')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  listCampaigns(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: CampaignFilterDto,
  ) {
    return this.campaignService.listCampaigns(tenant.tenantId, filter);
  }

  @Get('campaigns/:id')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  getCampaign(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.campaignService.getCampaignById(tenant.tenantId, id);
  }

  @Get('campaigns/:id/logs')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  getCampaignLogs(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.campaignService.getCampaignLogs(tenant.tenantId, id, {
      status,
      channel,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post('campaigns/:id/cancel')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_MANAGE)
  cancelCampaign(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.campaignService.cancelCampaign(tenant.tenantId, id);
  }

  // --- Audience Resolution ---
  @Post('audiences/resolve')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  resolveAudience(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: ResolveAudienceDto,
  ) {
    return this.audienceService.resolveAudience(tenant.tenantId, dto);
  }

  // --- Message Templates ---
  @Post('templates')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_MANAGE)
  createTemplate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templateService.createTemplate(tenant.tenantId, dto, user?.sub);
  }

  @Get('templates')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  listTemplates(
    @CurrentTenant() tenant: TenantContext,
    @Query('category') category?: TemplateCategory,
    @Query('channel') channel?: CampaignChannel,
  ) {
    return this.templateService.listTemplates(tenant.tenantId, category, channel);
  }

  @Get('templates/:id')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  getTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.templateService.getTemplateById(tenant.tenantId, id);
  }

  @Put('templates/:id')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_MANAGE)
  updateTemplate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templateService.updateTemplate(tenant.tenantId, id, dto, user?.sub);
  }

  @Delete('templates/:id')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_MANAGE)
  deleteTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.templateService.deleteTemplate(tenant.tenantId, id);
  }

  @Get('templates/:id/versions')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  getTemplateVersions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.templateService.getTemplateVersions(tenant.tenantId, id);
  }

  @Post('templates/:id/preview')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  previewTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body('variables') variables?: Record<string, any>,
  ) {
    return this.templateService.previewTemplate(tenant.tenantId, id, variables);
  }

  // --- Communication Settings & Policies ---
  @Get('settings')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  getSettings(@CurrentTenant() tenant: TenantContext) {
    return this.policyService.getSettings(tenant.tenantId);
  }

  @Put('settings')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_MANAGE)
  updateSettings(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateCommunicationSettingsDto,
  ) {
    return this.policyService.updateSettings(tenant.tenantId, dto);
  }

  @Post('settings/reset')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_MANAGE)
  resetSettings(@CurrentTenant() tenant: TenantContext) {
    return this.policyService.resetDefaultSettings(tenant.tenantId);
  }

  // --- Direct Messaging ---
  @Post('messages')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  sendMessage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.commsService.sendDirectMessage(tenant.tenantId, user?.id || user?.sub || 'user_demo', dto);
  }

  @Get('threads')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  getUserThreads(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    return this.commsService.getUserThreads(tenant.tenantId, user?.id || user?.sub || 'user_demo');
  }

  @Get('threads/:threadId')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  getThreadMessages(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('threadId') threadId: string,
  ) {
    return this.commsService.getThreadMessages(tenant.tenantId, threadId, user?.id || user?.sub || 'user_demo');
  }

  @Post('threads/:threadId/read')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  markThreadAsRead(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('threadId') threadId: string,
  ) {
    return this.commsService.markThreadAsRead(tenant.tenantId, threadId, user?.id || user?.sub || 'user_demo');
  }
}
