import { Controller, Get, Post, Put, Body, Param, Query, Headers } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  InitializePaymentDto,
  CreateVirtualAccountDto,
  TenantPaymentConfigDto,
  RefundPaymentDto,
} from './dto/payment.dto.js';

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

  @RequirePermissions(SystemPermissions.PAYMENTS_VIEW)
  @Get('gateway-config')
  async getGatewayConfig(@CurrentTenant() tenant: TenantContext) {
    return this.paymentsService.getGatewayConfig(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.FEES_MANAGE)
  @Put('gateway-config')
  async updateGatewayConfig(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: TenantPaymentConfigDto,
  ) {
    return this.paymentsService.updateGatewayConfig(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.PAYMENTS_VIEW)
  @Get(':id/receipt')
  async getReceipt(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.paymentsService.getReceipt(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.PAYMENTS_VIEW)
  @Get(':id/receipt/download')
  async downloadReceipt(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.paymentsService.getReceiptDownload(tenant.tenantId, id);
  }

  @Post('initialize')
  async initialize(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: InitializePaymentDto,
  ) {
    return this.paymentsService.initializePayment(tenant.tenantId, dto);
  }

  @Post('virtual-account')
  async createVirtualAccount(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateVirtualAccountDto,
  ) {
    return this.paymentsService.createVirtualAccount(tenant.tenantId, dto);
  }

  @Post('verify/:reference')
  async verify(
    @CurrentTenant() tenant: TenantContext,
    @Param('reference') reference: string,
  ) {
    return this.paymentsService.verifyPayment(tenant.tenantId, reference);
  }

  @RequirePermissions(SystemPermissions.FEES_MANAGE)
  @Post(':id/refund')
  async refundPayment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.paymentsService.refundPayment(
      tenant.tenantId,
      id,
      dto.reason || 'Administrative refund',
      user?.id || 'sys_user',
    );
  }

  @RequirePermissions(SystemPermissions.FEES_MANAGE)
  @Post('record')
  async recordOfflinePayment(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: any,
  ) {
    return this.paymentsService.recordOfflinePayment(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.FEES_MANAGE)
  @Post('reconcile')
  async reconcilePendingPayments(@CurrentTenant() tenant: TenantContext) {
    return this.paymentsService.reconcilePendingPayments(tenant.tenantId);
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
