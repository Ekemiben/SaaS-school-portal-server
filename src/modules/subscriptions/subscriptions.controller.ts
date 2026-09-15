import { Controller, Get, Post, Body } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { UsageMeteringService } from './usage-metering.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/subscription')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usageMeteringService: UsageMeteringService,
  ) {}

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

  @Post('upgrade')
  @RequirePermissions(SystemPermissions.SETTINGS_MANAGE)
  async upgradeSubscription(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.subscriptionsService.upgradeSubscription(tenant.tenantId, body);
  }

  @Get('usage')
  @RequirePermissions(SystemPermissions.BILLING_VIEW)
  async getTenantUsage(@CurrentTenant() tenant: TenantContext) {
    return this.usageMeteringService.getTenantUsage(tenant.tenantId);
  }
}
