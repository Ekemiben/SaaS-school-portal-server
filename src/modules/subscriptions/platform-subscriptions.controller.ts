import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { TenantLifecycleService } from './tenant-lifecycle.service.js';
import { QuotaOverrideDto } from './dto/quota-override.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/platform/subscriptions')
export class PlatformSubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly lifecycleService: TenantLifecycleService,
  ) {}

  @Get('all')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  getAllSubscriptions() {
    return this.subscriptionsService.getAllSubscriptions();
  }

  @Post('process-renewals')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  processRenewals() {
    return this.lifecycleService.processAutomatedRenewals();
  }

  @Post('enforce-lifecycles')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  enforceLifecycles() {
    return this.lifecycleService.enforceTenantLifecycles();
  }

  @Patch(':tenantId/override')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  overrideSubscription(
    @Param('tenantId') tenantId: string,
    @Body() dto: QuotaOverrideDto,
  ) {
    return this.subscriptionsService.overrideSubscription(tenantId, dto);
  }
}
