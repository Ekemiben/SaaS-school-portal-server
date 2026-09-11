import { Controller, Get, Post, Body, Param, Query, Headers } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('api/v1/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @RequirePermissions(SystemPermissions.PAYMENTS_VIEW)
  @Get()
  async listPayments(
    @CurrentTenant() tenant: TenantContext,
    @Query('studentId') studentId?: string,
  ) {
    return this.paymentsService.listPayments(tenant.tenantId, studentId);
  }

  @Post('initialize')
  async initialize(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.paymentsService.initializePayment(tenant.tenantId, body);
  }

  @Post('verify/:reference')
  async verify(
    @CurrentTenant() tenant: TenantContext,
    @Param('reference') reference: string,
  ) {
    return this.paymentsService.verifyPayment(tenant.tenantId, reference);
  }

  @Public()
  @Post('webhooks/paystack')
  async paystackWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any,
  ) {
    return this.paymentsService.handleWebhook('paystack', body, signature);
  }

  @Public()
  @Post('webhooks/flutterwave')
  async flutterwaveWebhook(
    @Headers('verif-hash') signature: string,
    @Body() body: any,
  ) {
    return this.paymentsService.handleWebhook('flutterwave', body, signature);
  }
}
