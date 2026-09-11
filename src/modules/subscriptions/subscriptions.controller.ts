import { Controller, Get } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';

@Controller('api/v1/subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  async getSubscription(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionsService.getSubscription(tenant.tenantId);
  }
}
