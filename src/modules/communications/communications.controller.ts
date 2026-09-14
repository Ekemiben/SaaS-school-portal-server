import {
  Controller,
  Get,
  Post,
  Put,
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
import { CreateCampaignDto, CampaignFilterDto } from './dto/campaign.dto.js';
import { ResolveAudienceDto } from './dto/audience.dto.js';
import { CreateTemplateDto, TemplateCategory } from './dto/template.dto.js';
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
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
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
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templateService.createTemplate(tenant.tenantId, dto);
  }

  @Get('templates')
  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  listTemplates(
    @CurrentTenant() tenant: TenantContext,
    @Query('category') category?: TemplateCategory,
  ) {
    return this.templateService.listTemplates(tenant.tenantId, category);
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

  // --- Direct Messaging ---
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
