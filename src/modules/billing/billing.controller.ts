import { Controller, Get, Post, Body } from '@nestjs/common';
import { BillingService } from './billing.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { SubscribePlanDto } from './dto/subscribe-plan.dto.js';

@Controller('api/v1/billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  getPlans() {
    return this.billingService.getAvailablePlans();
  }

  @Get('subscription')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  getCurrentSubscription(@CurrentTenant() tenant: TenantContext) {
    return this.billingService.getCurrentSubscription(tenant.tenantId);
  }

  @Post('subscription')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  updateSubscription(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SubscribePlanDto,
  ) {
    return this.billingService.updateSubscription(tenant.tenantId, dto);
  }

  @Get('invoices')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  getBillingInvoices(@CurrentTenant() tenant: TenantContext) {
    return this.billingService.getBillingInvoices(tenant.tenantId);
  }
}
