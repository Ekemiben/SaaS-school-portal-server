import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  Req,
} from '@nestjs/common';
import { BillingService } from './billing.service.js';
import { SubscriptionPaymentsService } from './subscription-payments.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { SubscribePlanDto, CancelSubscriptionDto } from './dto/subscribe-plan.dto.js';
import { PayBillingInvoiceDto } from './dto/billing-payment.dto.js';
import {
  InitializeSubscriptionPaymentDto,
  VerifySubscriptionPaymentDto,
  InitiateBankTransferDto,
  SubmitBankTransferProofDto,
} from './dto/subscription-payment-flow.dto.js';

@Controller('api/v1/billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly subscriptionPaymentsService: SubscriptionPaymentsService,
  ) {}

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
  updateSubscriptionLegacy(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SubscribePlanDto,
  ) {
    return this.billingService.updateSubscription(tenant.tenantId, dto);
  }

  @Post('subscribe')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  subscribePlan(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SubscribePlanDto,
  ) {
    return this.billingService.updateSubscription(tenant.tenantId, dto);
  }

  @Post('cancel')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  cancelSubscription(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CancelSubscriptionDto,
  ) {
    return this.billingService.cancelSubscription(tenant.tenantId, dto);
  }

  @Get('invoices')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  getBillingInvoices(@CurrentTenant() tenant: TenantContext) {
    return this.billingService.getBillingInvoices(tenant.tenantId);
  }

  @Post('invoices/:id/pay')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  payBillingInvoice(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') invoiceId: string,
    @Body() dto: PayBillingInvoiceDto,
  ) {
    return this.billingService.payBillingInvoice(tenant.tenantId, invoiceId, dto);
  }

  // =========================================================================
  // STEP 7: SAAS SUBSCRIPTION PAYMENT FLOWS
  // =========================================================================

  /**
   * Online Payment: Initializes Paystack transaction for SaaS plan subscription.
   */
  @Post('subscription/initialize-payment')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  initializeOnlinePayment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: InitializeSubscriptionPaymentDto,
  ) {
    return this.subscriptionPaymentsService.initializeOnlinePayment(
      tenant.tenantId,
      user?.email || 'admin@school.portal',
      dto,
    );
  }

  /**
   * Online Payment: Verifies Paystack transaction with strict idempotency.
   */
  @Post('subscription/verify-payment')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  verifyOnlinePayment(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: VerifySubscriptionPaymentDto,
  ) {
    return this.subscriptionPaymentsService.verifyOnlinePayment(tenant.tenantId, dto.reference);
  }

  /**
   * Bank Transfer: Generates pending invoice and official platform bank details.
   */
  @Post('subscription/bank-transfer/initiate')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  initiateBankTransfer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: InitiateBankTransferDto,
  ) {
    return this.subscriptionPaymentsService.initiateBankTransfer(
      tenant.tenantId,
      user?.email || 'admin@school.portal',
      dto,
    );
  }

  /**
   * Bank Transfer: Tenant submits payment transfer proof.
   */
  @Post('subscription/bank-transfer/submit-proof')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  submitBankTransferProof(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SubmitBankTransferProofDto,
  ) {
    return this.subscriptionPaymentsService.submitBankTransferProof(tenant.tenantId, dto);
  }

  /**
   * Subscription Payment History: Lists payments for current tenant.
   */
  @Get('subscription/payments')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  listSubscriptionPayments(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionPaymentsService.listTenantPayments(tenant.tenantId);
  }

  /**
   * Official Subscription Receipt: Generates official PDF/JSON receipt.
   */
  @Get('subscription/receipts/:paymentId')
  @RequirePermissions(SystemPermissions.BILLING_MANAGE)
  getSubscriptionReceipt(
    @CurrentTenant() tenant: TenantContext,
    @Param('paymentId') paymentId: string,
  ) {
    return this.subscriptionPaymentsService.generateSubscriptionReceipt(tenant.tenantId, paymentId, false);
  }

  /**
   * Paystack Webhook: Receives and verifies asynchronous charge events.
   */
  @Public()
  @Post('webhook/paystack')
  handlePaystackWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const rawPayload = req.rawBody || body;
    return this.subscriptionPaymentsService.handlePaystackWebhook(signature, body, rawPayload);
  }

  /**
   * Flutterwave Webhook: Receives and verifies asynchronous charge events.
   */
  @Public()
  @Post('webhook/flutterwave')
  handleFlutterwaveWebhook(
    @Headers('verif-hash') signature: string,
    @Body() body: any,
  ) {
    return this.subscriptionPaymentsService.handleFlutterwaveWebhook(signature, body);
  }
}

