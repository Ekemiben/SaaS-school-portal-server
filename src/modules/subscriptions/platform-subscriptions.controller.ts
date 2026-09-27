import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Body,
  Param,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { TenantLifecycleService } from './tenant-lifecycle.service.js';
import { SubscriptionPaymentsService } from '../billing/subscription-payments.service.js';
import { QuotaOverrideDto } from './dto/quota-override.dto.js';
import { RecordManualPaymentDto } from '../billing/dto/subscription-payment-flow.dto.js';
import { SuperAdminChangePlanDto, PreviewPlanChangeDto } from './dto/plan-change.dto.js';
import {
  PlatformSubscriptionFilterDto,
  UpdatePlanConfigDto,
  GrantIncentiveDto,
  TenantActionReasonDto,
} from './dto/platform-subscription-management.dto.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/platform/subscriptions')
export class PlatformSubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly lifecycleService: TenantLifecycleService,
    @Inject(forwardRef(() => SubscriptionPaymentsService))
    private readonly subscriptionPaymentsService: SubscriptionPaymentsService,
  ) {}

  @Get()
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  listAllSubscriptions(@Query() filter: PlatformSubscriptionFilterDto) {
    return this.subscriptionsService.getAllSubscriptions(filter);
  }

  @Get('all')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  getAllSubscriptions(@Query() filter: PlatformSubscriptionFilterDto) {
    return this.subscriptionsService.getAllSubscriptions(filter);
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

  @Post(':tenantId/activate')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  activateSubscription(
    @Param('tenantId') tenantId: string,
    @Body() body: any,
  ) {
    return this.lifecycleService.activateSubscription(tenantId, body);
  }

  @Post(':tenantId/suspend')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  suspendSubscription(
    @Param('tenantId') tenantId: string,
    @Body() body: TenantActionReasonDto,
  ) {
    return this.lifecycleService.suspendSubscription(tenantId, body?.reason);
  }

  @Post(':tenantId/reactivate')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  reactivateSubscription(@Param('tenantId') tenantId: string) {
    return this.lifecycleService.reactivateSubscription(tenantId);
  }

  @Post(':tenantId/cancel')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  cancelSubscription(
    @Param('tenantId') tenantId: string,
    @Body() body: { reason?: string },
  ) {
    return this.lifecycleService.cancelSubscription(tenantId, body?.reason);
  }

  @Post(':tenantId/verify-payment')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  verifyPayment(
    @Param('tenantId') tenantId: string,
    @Body() body: any,
  ) {
    return this.subscriptionsService.verifySubscriptionPayment(tenantId, body);
  }

  // =========================================================================
  // STEP 7: SUPER ADMIN PAYMENT LEDGER & MANUAL ASSIGNMENT
  // =========================================================================

  /**
   * Super Admin: Manually record SaaS subscription payment (cash/bank transfer/cheque).
   * Generates immutable payment record, paid invoice, and comprehensive audit log.
   */
  @Post(':tenantId/record-payment')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  recordManualPayment(
    @Param('tenantId') tenantId: string,
    @CurrentUser() adminUser: any,
    @Body() dto: RecordManualPaymentDto,
  ) {
    return this.subscriptionPaymentsService.recordManualPaymentBySuperAdmin(
      tenantId,
      adminUser || { email: 'superadmin@edusaas.com', userId: 'usr_super_admin' },
      dto,
    );
  }

  /**
   * Super Admin: List all platform subscription payments across all tenants.
   */
  @Get('payments')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  listAllPayments() {
    return this.subscriptionPaymentsService.listPlatformPayments();
  }

  /**
   * Super Admin: View/download any school's subscription receipt.
   */
  @Get('receipts/:paymentId')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  getPaymentReceipt(@Param('paymentId') paymentId: string) {
    return this.subscriptionPaymentsService.generateSubscriptionReceipt('', paymentId, true);
  }

  // =========================================================================
  // STEP 8: SUPER ADMIN PLAN UPGRADE / DOWNGRADE / CHANGE
  // =========================================================================

  /**
   * Super Admin: Previews subscription plan change for any tenant (quotas, proration, feature diff).
   */
  @Post(':tenantId/preview-plan-change')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  previewPlanChange(
    @Param('tenantId') tenantId: string,
    @Body() dto: PreviewPlanChangeDto,
  ) {
    return this.subscriptionsService.previewPlanChange(tenantId, dto);
  }

  /**
   * Super Admin: Changes subscription plan for any tenant with audit logging and optional quota override.
   */
  @Post(':tenantId/change-plan')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  changePlan(
    @Param('tenantId') tenantId: string,
    @CurrentUser() adminUser: any,
    @Body() dto: SuperAdminChangePlanDto,
  ) {
    return this.subscriptionsService.changePlanBySuperAdmin(
      tenantId,
      adminUser || { email: 'superadmin@edusaas.com', userId: 'usr_super_admin' },
      dto,
    );
  }
// =========================================================================
  // STEP 9: PLATFORM SUPER ADMIN SUBSCRIPTION MANAGEMENT
  // =========================================================================

  /**
   * Super Admin: Global platform subscription statistics and metrics.
   */
  @Get('stats')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  getSubscriptionStats() {
    return this.subscriptionsService.getPlatformSubscriptionStats();
  }

  /**
   * Super Admin: View all 4 database-driven subscription plans and configurations.
   */
  @Get('plans')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  getPlatformPlans() {
    return this.subscriptionsService.getPlatformPlans();
  }

  /**
   * Super Admin: Configure plan pricing, discounts, limits, and features.
   */
  @Patch('plans/:tier')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  updatePlatformPlan(
    @Param('tier') tier: string,
    @CurrentUser() adminUser: any,
    @Body() dto: UpdatePlanConfigDto,
  ) {
    return this.subscriptionsService.updatePlatformPlan(
      tier,
      dto,
      adminUser || { email: 'superadmin@edusaas.com', userId: 'usr_super_admin' },
    );
  }

  /**
   * Super Admin: Manually deactivates a school subscription.
   */
  @Post(':tenantId/deactivate')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  deactivateSubscription(
    @Param('tenantId') tenantId: string,
    @CurrentUser() adminUser: any,
    @Body() body: TenantActionReasonDto,
  ) {
    return this.subscriptionsService.deactivateSubscription(
      tenantId,
      body?.reason,
      adminUser || { email: 'superadmin@edusaas.com', userId: 'usr_super_admin' },
    );
  }

  /**
   * Super Admin: Archives a school tenant and cancels its subscription.
   */
  @Post(':tenantId/archive')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  archiveSchool(
    @Param('tenantId') tenantId: string,
    @CurrentUser() adminUser: any,
    @Body() body: TenantActionReasonDto,
  ) {
    return this.subscriptionsService.archiveSchool(
      tenantId,
      body?.reason,
      adminUser || { email: 'superadmin@edusaas.com', userId: 'usr_super_admin' },
    );
  }

  /**
   * Super Admin: Grants an incentive/promotional feature to a school tenant.
   */
  @Post(':tenantId/incentives')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  grantIncentive(
    @Param('tenantId') tenantId: string,
    @CurrentUser() adminUser: any,
    @Body() dto: GrantIncentiveDto,
  ) {
    return this.subscriptionsService.grantTenantIncentive(
      tenantId,
      dto,
      adminUser || { email: 'superadmin@edusaas.com', userId: 'usr_super_admin' },
    );
  }

  /**
   * Super Admin: Revokes an incentive/promotional feature from a school tenant.
   */
  @Delete(':tenantId/incentives/:featureKey')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  revokeIncentive(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
    @CurrentUser() adminUser: any,
  ) {
    return this.subscriptionsService.revokeTenantIncentive(
      tenantId,
      featureKey,
      adminUser || { email: 'superadmin@edusaas.com', userId: 'usr_super_admin' },
    );
  }

  /**
   * Super Admin: Retrieves detailed subscription history, invoices, payments, and audit trail for a school.
   */
  @Get(':tenantId/history')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  getTenantHistory(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.getTenantSubscriptionHistory(tenantId);
  }

  /**
   * Super Admin: Retrieves current subscription, plan tier, features, and incentives for a tenant.
   */
  @Get(':tenantId')
  @RequirePermissions(SystemPermissions.PLATFORM_ADMIN)
  getTenantSubscription(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.getSubscription(tenantId);
  }
}
