import { Controller, Get, Post, Body } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { UsageMeteringService } from './usage-metering.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CreateCustomPlanRequestDto } from './dto/custom-plan-request.dto.js';
import {
  PreviewPlanChangeDto,
  UpgradeSubscriptionDto,
  DowngradeSubscriptionDto,
} from './dto/plan-change.dto.js';

@Controller('api/v1/subscription')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usageMeteringService: UsageMeteringService,
  ) {}

  @Public()
  @Get('plans/public')
  async getPublicPlans() {
    return this.subscriptionsService.getPublicPlans();
  }

  @Public()
  @Post('custom-request')
  async createCustomPlanRequest(@Body() dto: CreateCustomPlanRequestDto) {
    return this.subscriptionsService.createCustomPlanRequest(dto);
  }

  @Get()
  async getSubscription(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionsService.getSubscription(tenant.tenantId);
  }

  @Get('plans')
  async getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Get('invoices')
  @RequirePermissions(SystemPermissions.BILLING_VIEW)
  async getInvoices(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionsService.getInvoices(tenant.tenantId);
  }

  @Post('preview-change')
  @RequirePermissions(SystemPermissions.SETTINGS_MANAGE)
  async previewPlanChange(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: PreviewPlanChangeDto,
  ) {
    return this.subscriptionsService.previewPlanChange(tenant.tenantId, dto);
  }

  @Post('upgrade')
  @RequirePermissions(SystemPermissions.SETTINGS_MANAGE)
  async upgradeSubscription(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpgradeSubscriptionDto,
  ) {
    return this.subscriptionsService.upgradeSubscription(tenant.tenantId, dto);
  }

  @Post('downgrade')
  @RequirePermissions(SystemPermissions.SETTINGS_MANAGE)
  async downgradeSubscription(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: DowngradeSubscriptionDto,
  ) {
    return this.subscriptionsService.downgradeSubscription(tenant.tenantId, dto);
  }

  @Get('usage')
  @RequirePermissions(SystemPermissions.BILLING_VIEW)
  async getTenantUsage(@CurrentTenant() tenant: TenantContext) {
    return this.usageMeteringService.getTenantUsage(tenant.tenantId);
  }
}
