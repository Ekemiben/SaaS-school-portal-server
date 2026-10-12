import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { TransitionService } from './transition.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequireAnyPermission } from '../../common/decorators/permissions.decorator.js';
import {
  CreateTransitionConfigDto,
  UpdateTransitionConfigDto,
  UpdateTransitionApplicationStatusDto,
  BulkReviewTransitionDto,
  CreateTransitionBenefitDto,
  UpdateTransitionBenefitDto,
  CreateTransitionScholarshipDto,
  UpdateTransitionScholarshipDto,
  CreateTransitionEventDto,
  UpdateTransitionEventDto,
  RespondTransitionInquiryDto,
  CreateTransitionShowcaseItemDto,
  UpdateTransitionShowcaseItemDto,
  CreateTransitionReasonDto,
  UpdateTransitionReasonDto,
} from './dto/transition.dto.js';
import { TransitionStatus, ShowcaseCategory, InquiryStatus } from '@prisma/client';

@Controller(['api/v1/transitions', 'transitions'])
export class TransitionController {
  constructor(private readonly transitionService: TransitionService) {}

  // ==========================================
  // DASHBOARD & ANALYTICS
  // ==========================================

  @Get('analytics')
  @RequireAnyPermission('transitions.view', 'admissions.view', 'students.view')
  async getAnalytics(
    @CurrentTenant() tenant: TenantContext,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.transitionService.getDashboardAnalytics(tenant.tenantId, academicYearId);
  }

  @Post('sync-eligible')
  @RequireAnyPermission('transitions.manage', 'admissions.manage', 'students.manage')
  async syncEligible(
    @CurrentTenant() tenant: TenantContext,
    @Body('academicYearId') academicYearId?: string,
  ) {
    return this.transitionService.syncEligibleStudents(tenant.tenantId, academicYearId);
  }

  // ==========================================
  // CONFIGURATIONS
  // ==========================================

  @Get('configs')
  @RequireAnyPermission('transitions.view', 'admissions.view')
  async getConfigs(
    @CurrentTenant() tenant: TenantContext,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.transitionService.getConfigs(tenant.tenantId, academicYearId);
  }

  @Post('configs')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async saveConfig(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateTransitionConfigDto,
  ) {
    return this.transitionService.saveConfig(tenant.tenantId, dto);
  }

  @Patch('configs/:id')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async updateConfig(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateTransitionConfigDto,
  ) {
    return this.transitionService.updateConfig(tenant.tenantId, id, dto);
  }

  // ==========================================
  // APPLICATIONS
  // ==========================================

  @Get('applications')
  @RequireAnyPermission('transitions.view', 'admissions.view', 'students.view')
  async listApplications(
    @CurrentTenant() tenant: TenantContext,
    @Query('academicYearId') academicYearId?: string,
    @Query('status') status?: TransitionStatus,
    @Query('sourceClassId') sourceClassId?: string,
    @Query('targetClassId') targetClassId?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.transitionService.listApplications(tenant.tenantId, {
      academicYearId,
      status,
      sourceClassId,
      targetClassId,
      search,
      page,
      limit,
    });
  }

  @Get('applications/:id')
  @RequireAnyPermission('transitions.view', 'admissions.view')
  async getApplicationById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.transitionService.getApplicationById(tenant.tenantId, id);
  }

  @Patch('applications/:id/status')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async updateApplicationStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateTransitionApplicationStatusDto,
  ) {
    return this.transitionService.updateApplicationStatus(
      tenant.tenantId,
      id,
      dto,
      user?.id,
    );
  }

  @Post('applications/bulk-review')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async bulkReviewApplications(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: BulkReviewTransitionDto,
  ) {
    return this.transitionService.bulkReviewApplications(
      tenant.tenantId,
      dto,
      user?.id,
    );
  }

  @Post('applications/:id/confirm')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async confirmEnrollment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() options?: { targetClassArmId?: string; applyWaiver?: boolean },
  ) {
    return this.transitionService.confirmEnrollment(tenant.tenantId, id, options);
  }

  // ==========================================
  // BENEFITS
  // ==========================================

  @Get('benefits')
  async listBenefits(
    @CurrentTenant() tenant: TenantContext,
    @Query('isActiveOnly') isActiveOnly?: boolean,
  ) {
    return this.transitionService.listBenefits(tenant.tenantId, isActiveOnly);
  }

  @Post('benefits')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async createBenefit(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateTransitionBenefitDto,
  ) {
    return this.transitionService.createBenefit(tenant.tenantId, dto);
  }

  @Patch('benefits/:id')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async updateBenefit(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateTransitionBenefitDto,
  ) {
    return this.transitionService.updateBenefit(tenant.tenantId, id, dto);
  }

  @Delete('benefits/:id')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async deleteBenefit(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.transitionService.deleteBenefit(tenant.tenantId, id);
  }

  // ==========================================
  // SCHOLARSHIPS
  // ==========================================

  @Get('scholarships')
  async listScholarships(
    @CurrentTenant() tenant: TenantContext,
    @Query('isActiveOnly') isActiveOnly?: boolean,
  ) {
    return this.transitionService.listScholarships(tenant.tenantId, isActiveOnly);
  }

  @Post('scholarships')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async createScholarship(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateTransitionScholarshipDto,
  ) {
    return this.transitionService.createScholarship(tenant.tenantId, dto);
  }

  @Patch('scholarships/:id')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async updateScholarship(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateTransitionScholarshipDto,
  ) {
    return this.transitionService.updateScholarship(tenant.tenantId, id, dto);
  }

  @Delete('scholarships/:id')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async deleteScholarship(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.transitionService.deleteScholarship(tenant.tenantId, id);
  }

  // ==========================================
  // EVENTS & RSVPS
  // ==========================================

  @Get('events')
  async listEvents(
    @CurrentTenant() tenant: TenantContext,
    @Query('includeUnpublished') includeUnpublished?: boolean,
  ) {
    return this.transitionService.listEvents(tenant.tenantId, includeUnpublished);
  }

  @Post('events')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async createEvent(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateTransitionEventDto,
  ) {
    return this.transitionService.createEvent(tenant.tenantId, dto);
  }

  @Patch('events/:id')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async updateEvent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateTransitionEventDto,
  ) {
    return this.transitionService.updateEvent(tenant.tenantId, id, dto);
  }

  @Delete('events/:id')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async deleteEvent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.transitionService.deleteEvent(tenant.tenantId, id);
  }

  @Get('events/:id/rsvps')
  @RequireAnyPermission('transitions.view', 'admissions.view')
  async listEventRsvps(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.transitionService.listEventRsvps(tenant.tenantId, id);
  }

  // ==========================================
  // INQUIRIES & Q&A
  // ==========================================

  @Get('inquiries')
  @RequireAnyPermission('transitions.view', 'admissions.view')
  async listInquiries(
    @CurrentTenant() tenant: TenantContext,
    @Query('status') status?: InquiryStatus,
  ) {
    return this.transitionService.listInquiries(tenant.tenantId, status);
  }

  @Post('inquiries/:id/respond')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async respondToInquiry(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RespondTransitionInquiryDto,
  ) {
    return this.transitionService.respondToInquiry(
      tenant.tenantId,
      id,
      dto,
      user?.id,
    );
  }

  // ==========================================
  // SHOWCASE ITEMS
  // ==========================================

  @Get('showcases')
  async listShowcaseItems(
    @CurrentTenant() tenant: TenantContext,
    @Query('category') category?: ShowcaseCategory,
    @Query('isActiveOnly') isActiveOnly?: boolean,
  ) {
    return this.transitionService.listShowcaseItems(
      tenant.tenantId,
      category,
      isActiveOnly,
    );
  }

  @Post('showcases')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async createShowcaseItem(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateTransitionShowcaseItemDto,
  ) {
    return this.transitionService.createShowcaseItem(tenant.tenantId, dto);
  }

  @Patch('showcases/:id')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async updateShowcaseItem(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateTransitionShowcaseItemDto,
  ) {
    return this.transitionService.updateShowcaseItem(tenant.tenantId, id, dto);
  }

  @Delete('showcases/:id')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async deleteShowcaseItem(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.transitionService.deleteShowcaseItem(tenant.tenantId, id);
  }

  // ==========================================
  // REASONS
  // ==========================================

  @Get('reasons')
  async listReasons(
    @CurrentTenant() tenant: TenantContext,
    @Query('isActiveOnly') isActiveOnly?: boolean,
  ) {
    return this.transitionService.listReasons(tenant.tenantId, isActiveOnly);
  }

  @Post('reasons')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async createReason(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateTransitionReasonDto,
  ) {
    return this.transitionService.createReason(tenant.tenantId, dto);
  }

  @Patch('reasons/:id')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async updateReason(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateTransitionReasonDto,
  ) {
    return this.transitionService.updateReason(tenant.tenantId, id, dto);
  }

  @Delete('reasons/:id')
  @RequireAnyPermission('transitions.manage', 'admissions.manage')
  async deleteReason(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.transitionService.deleteReason(tenant.tenantId, id);
  }
}
