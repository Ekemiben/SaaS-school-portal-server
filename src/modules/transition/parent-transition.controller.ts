import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { TransitionService } from './transition.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import {
  ParentSubmitTransitionDto,
  ParentOptOutTransitionDto,
  TransitionRsvpDto,
  CreateTransitionInquiryDto,
} from './dto/transition.dto.js';
import { ShowcaseCategory } from '@prisma/client';

@Controller(['api/v1/parent/transitions', 'parent/transitions'])
export class ParentTransitionController {
  constructor(private readonly transitionService: TransitionService) {}

  @Get('my-wards')
  async getMyWards(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    return this.transitionService.getParentTransitions(tenant.tenantId, user?.id);
  }

  @Post('apply')
  async submitApplication(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: ParentSubmitTransitionDto,
  ) {
    return this.transitionService.parentSubmitApplication(
      tenant.tenantId,
      user?.id,
      dto,
    );
  }

  @Post('opt-out')
  async optOut(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: ParentOptOutTransitionDto,
  ) {
    return this.transitionService.parentOptOut(tenant.tenantId, user?.id, dto);
  }

  @Post(':id/accept-offer')
  async acceptOffer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.transitionService.parentAcceptOffer(tenant.tenantId, user?.id, id);
  }

  @Get('events')
  async listEvents(@CurrentTenant() tenant: TenantContext) {
    return this.transitionService.listEvents(tenant.tenantId, false);
  }

  @Post('rsvp')
  async submitRsvp(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: TransitionRsvpDto,
  ) {
    return this.transitionService.submitRsvp(tenant.tenantId, user?.id, dto);
  }

  @Get('showcase')
  async getShowcase(
    @CurrentTenant() tenant: TenantContext,
    @Query('category') category?: ShowcaseCategory,
  ) {
    return this.transitionService.listShowcaseItems(tenant.tenantId, category, true);
  }

  @Get('benefits')
  async getBenefits(@CurrentTenant() tenant: TenantContext) {
    return this.transitionService.listBenefits(tenant.tenantId, true);
  }

  @Get('scholarships')
  async getScholarships(@CurrentTenant() tenant: TenantContext) {
    return this.transitionService.listScholarships(tenant.tenantId, true);
  }

  @Get('reasons')
  async getReasons(@CurrentTenant() tenant: TenantContext) {
    return this.transitionService.listReasons(tenant.tenantId, true);
  }

  @Get('inquiries')
  async getMyInquiries(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    return this.transitionService.listInquiries(
      tenant.tenantId,
      undefined,
      user?.id,
    );
  }

  @Post('inquiries')
  async createInquiry(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateTransitionInquiryDto,
  ) {
    return this.transitionService.createInquiry(tenant.tenantId, user?.id, dto);
  }
}
