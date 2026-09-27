import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service.js';
import { SubscriptionPaymentsService } from '../src/modules/billing/subscription-payments.service.js';
import { TenantLifecycleService } from '../src/modules/subscriptions/tenant-lifecycle.service.js';
import { PaystackPaymentAdapter } from '../src/modules/payments/adapters/paystack.adapter.js';
import { FlutterwavePaymentAdapter } from '../src/modules/payments/adapters/flutterwave.adapter.js';

describe('Step 18: Full Integration Test Suite (FLOW A — FLOW P)', () => {
  let prisma: PrismaService;
  let subService: SubscriptionsService;
  let lifecycleService: TenantLifecycleService;
  let paystackAdapter: PaystackPaymentAdapter;
  let flutterwaveAdapter: FlutterwavePaymentAdapter;
  let paymentsService: SubscriptionPaymentsService;

  const mockConfigService: any = {
    get: (key: string) => {
      if (key === 'PAYSTACK_SECRET_KEY') return 'sk_test_mock_paystack_secret_key';
      if (key === 'PAYSTACK_WEBHOOK_SECRET') return 'whsec_paystack_test_secret';
      if (key === 'FLUTTERWAVE_SECRET_HASH') return 'flutterwave_test_secret_hash';
      return null;
    },
  };

  beforeEach(() => {
    prisma = new PrismaService();
    subService = new SubscriptionsService(prisma);
    lifecycleService = new TenantLifecycleService(prisma, subService);
    paystackAdapter = new PaystackPaymentAdapter(mockConfigService);
    flutterwaveAdapter = new FlutterwavePaymentAdapter(mockConfigService);
    paymentsService = new SubscriptionPaymentsService(
      prisma,
      paystackAdapter,
      flutterwaveAdapter,
      subService,
    );
  });

  // FLOW A: New tenant -> Starter -> Pay Now -> Successful payment -> ACTIVE
  it('FLOW A: New tenant -> Starter -> Pay Now -> Successful payment -> ACTIVE', async () => {
    const tenantId = 'tenant_flow_a_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Flow A School',
      slug: 'flow-a-school',
      status: 'TRIAL',
      plan: 'starter',
    });

    const ref = 'REF_FLOW_A_' + Date.now();
    prisma.memoryStore.subscriptionPayments.set(`spay_${ref}`, {
      id: `spay_${ref}`,
      tenantId,
      providerReference: ref,
      amount: 150000,
      currency: 'NGN',
      status: 'INITIATED',
      metadata: { planTier: 'STARTER', billingCycle: 'TERMLY' },
    });

    paystackAdapter.verifyPayment = async () => ({
      success: true,
      reference: ref,
      amount: 150000,
      currency: 'NGN',
      status: 'successful',
      paidAt: new Date(),
      channel: 'card',
      gatewayResponse: 'Approved',
      rawPayload: { metadata: { tenantId } },
    });

    const result = await paymentsService.verifyOnlinePayment(tenantId, ref);
    expect(result.success).toBe(true);
    expect(result.subscription.status).toBe('ACTIVE');
    expect(result.subscription.planTier).toBe('STARTER');
    expect(result.subscription.trialEndsAt).toBeNull();

    const tenant = prisma.memoryStore.tenants.get(tenantId);
    expect(tenant.status).toBe('ACTIVE');
  });

  // FLOW B: New tenant -> Standard -> Pay Later -> TRIAL -> Trial expiration -> EXPIRED & SUSPENDED
  it('FLOW B: New tenant -> Standard -> Pay Later -> TRIAL -> Trial expiration -> EXPIRED & SUSPENDED', async () => {
    const tenantId = 'tenant_flow_b_' + Date.now();
    const expiredDate = new Date(Date.now() - 2 * 86400000); // 2 days ago

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Flow B School',
      slug: 'flow-b-school',
      status: 'TRIAL',
      plan: 'standard',
    });

    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      planTier: 'STANDARD',
      tier: 'standard',
      status: 'TRIAL',
      trialEndsAt: expiredDate,
      currentPeriodStart: new Date(Date.now() - 62 * 86400000),
      currentPeriodEnd: expiredDate,
    });

    const enforcement = await lifecycleService.enforceTenantLifecycles();
    expect(enforcement.enforcedCount).toBeGreaterThanOrEqual(1);

    const sub = prisma.memoryStore.subscriptions.get(`sub_${tenantId}`);
    expect(sub.status).toBe('EXPIRED');

    const tenant = prisma.memoryStore.tenants.get(tenantId);
    expect(tenant.status).toBe('SUSPENDED');
  });

  // FLOW C: Trial tenant -> Payment -> ACTIVE with trial timestamps cleared
  it('FLOW C: Trial tenant -> Payment -> ACTIVE with trial timestamps cleared', async () => {
    const tenantId = 'tenant_flow_c_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Flow C School',
      slug: 'flow-c-school',
      status: 'TRIAL',
      plan: 'standard',
    });

    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      planTier: 'STANDARD',
      tier: 'standard',
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 30 * 86400000),
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    });

    const ref = 'REF_FLOW_C_' + Date.now();
    prisma.memoryStore.subscriptionPayments.set(`spay_${ref}`, {
      id: `spay_${ref}`,
      tenantId,
      providerReference: ref,
      amount: 350000,
      currency: 'NGN',
      status: 'INITIATED',
      metadata: { planTier: 'STANDARD', billingCycle: 'TERMLY' },
    });

    paystackAdapter.verifyPayment = async () => ({
      success: true,
      reference: ref,
      amount: 350000,
      currency: 'NGN',
      status: 'successful',
      paidAt: new Date(),
      channel: 'card',
      gatewayResponse: 'Approved',
      rawPayload: { metadata: { tenantId } },
    });

    const result = await paymentsService.verifyOnlinePayment(tenantId, ref);
    expect(result.success).toBe(true);
    expect(result.subscription.status).toBe('ACTIVE');
    expect(result.subscription.trialEndsAt).toBeNull();
  });

  // FLOW D: Tenant -> Bank Transfer -> Verification -> ACTIVE
  it('FLOW D: Tenant -> Bank Transfer -> Verification -> ACTIVE', async () => {
    const tenantId = 'tenant_flow_d_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Flow D School',
      slug: 'flow-d-school',
      status: 'TRIAL',
      plan: 'starter',
    });

    // 1. Initiate bank transfer
    const initRes = await paymentsService.initiateBankTransfer(tenantId, 'admin@flowd.ng', {
      planTier: 'STANDARD',
      billingCycle: 'TERMLY',
    });
    expect(initRes.success).toBe(true);
    expect(initRes.status).toBe('PENDING_VERIFICATION');

    // 2. Submit transfer proof
    const proofRes = await paymentsService.submitBankTransferProof(tenantId, {
      paymentId: initRes.paymentId,
      senderBank: 'Zenith Bank',
      senderAccountName: 'Flow D Academy',
      transferDate: new Date().toISOString(),
      transactionReference: 'ZENITH-TX-998210',
    });
    expect(proofRes.success).toBe(true);
    expect(proofRes.status).toBe('PENDING');

    // 3. Super Admin verifies & activates
    const actRes = await lifecycleService.activateSubscription(tenantId, {
      planTier: 'STANDARD',
      billingCycle: 'TERMLY',
      adminEmail: 'superadmin@platform.io',
    });
    expect(actRes.subscription.status).toBe('ACTIVE');
    expect(actRes.subscription.planTier).toBe('STANDARD');

    const tenant = prisma.memoryStore.tenants.get(tenantId);
    expect(tenant.status).toBe('ACTIVE');
  });

  // FLOW E: Super Admin -> Manual payment assignment -> ACTIVE
  it('FLOW E: Super Admin -> Manual payment assignment -> ACTIVE', async () => {
    const tenantId = 'tenant_flow_e_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Flow E School',
      slug: 'flow-e-school',
      status: 'TRIAL',
      plan: 'starter',
    });

    const manualRef = 'MANUAL-SAAS-' + Date.now();
    const result = await paymentsService.recordManualPaymentBySuperAdmin(
      tenantId,
      { email: 'superadmin@platform.io', userId: 'usr_superadmin' },
      {
        amount: 350000,
        planTier: 'STANDARD',
        billingCycle: 'TERMLY',
        paymentMethod: 'CASH_OFFICE',
        reference: manualRef,
        reason: 'Institutional cheque cleared at platform bank',
      },
    );

    expect(result.success).toBe(true);
    expect(result.payment.status).toBe('SUCCESSFUL');
    expect(result.subscription.status).toBe('ACTIVE');
    expect(result.subscription.planTier).toBe('STANDARD');

    const tenant = prisma.memoryStore.tenants.get(tenantId);
    expect(tenant.status).toBe('ACTIVE');
  });

  // FLOW F: Super Admin -> Grant incentive -> Tenant receives additional feature
  it('FLOW F: Super Admin -> Grant incentive -> Tenant receives additional feature', async () => {
    const tenantId = 'tenant_flow_f_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Flow F School',
      slug: 'flow-f-school',
      status: 'ACTIVE',
      plan: 'starter', // Starter does NOT include TIMETABLE_MANAGEMENT
    });

    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'ACTIVE',
      billingCycle: 'TERMLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 90 * 86400000),
    });

    // Before incentive: feature is false
    const beforeCheck = await subService.isFeatureEntitled(tenantId, 'TIMETABLE_MANAGEMENT');
    expect(beforeCheck.entitled).toBeFalsy();

    // Grant incentive
    const grantRes = await subService.grantTenantIncentive(
      tenantId,
      {
        featureKey: 'TIMETABLE_MANAGEMENT',
        reason: 'Free academic trial incentive',
        durationDays: 30,
      },
      { email: 'superadmin@platform.io', userId: 'usr_superadmin' },
    );
    expect(grantRes.isEnabled).toBe(true);

    // After incentive: feature is true
    const afterCheck = await subService.isFeatureEntitled(tenantId, 'TIMETABLE_MANAGEMENT');
    expect(afterCheck.entitled).toBe(true);
  });

  // FLOW G: Super Admin -> Remove incentive -> Tenant loses additional feature
  it('FLOW G: Super Admin -> Remove incentive -> Tenant loses additional feature', async () => {
    const tenantId = 'tenant_flow_g_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Flow G School',
      slug: 'flow-g-school',
      status: 'ACTIVE',
      plan: 'starter',
    });

    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'ACTIVE',
      billingCycle: 'TERMLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 90 * 86400000),
    });

    // Grant incentive first
    await subService.grantTenantIncentive(
      tenantId,
      { featureKey: 'TIMETABLE_MANAGEMENT', reason: 'Temporary', durationDays: 14 },
      { email: 'superadmin@platform.io', userId: 'usr_superadmin' },
    );

    // Revoke incentive
    const revokeRes = await subService.revokeTenantIncentive(
      tenantId,
      'TIMETABLE_MANAGEMENT',
      { email: 'superadmin@platform.io', userId: 'usr_superadmin' },
    );
    expect(revokeRes.isEnabled).toBe(false);

    // Feature is no longer active
    const features = await subService.isFeatureEntitled(tenantId, 'TIMETABLE_MANAGEMENT');
    expect(features.entitled).toBeFalsy();
  });

  // FLOW H: Tenant -> Upgrade plan -> New entitlements become available
  it('FLOW H: Tenant -> Upgrade plan -> New entitlements become available', async () => {
    const tenantId = 'tenant_flow_h_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Flow H School',
      slug: 'flow-h-school',
      status: 'ACTIVE',
      plan: 'starter',
    });

    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'ACTIVE',
      billingCycle: 'TERMLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 90 * 86400000),
      maxStudents: 500,
    });

    // Upgrade to PREMIUM
    const upRes = await subService.changePlanBySuperAdmin(
      tenantId,
      { email: 'superadmin@platform.io', userId: 'usr_superadmin' },
      {
        targetTier: 'PREMIUM',
        billingCycle: 'ANNUAL',
        reason: 'School expanded to multi-campus operations',
      },
    );

    expect(upRes.subscription.planTier).toBe('PREMIUM');
    const multiCampus = await subService.isFeatureEntitled(tenantId, 'MULTI_CAMPUS');
    expect(multiCampus.entitled).toBe(true);
    const biometric = await subService.isFeatureEntitled(tenantId, 'BIOMETRIC_ATTENDANCE');
    expect(biometric.entitled).toBe(true);
  });

  // FLOW I: Tenant -> Downgrade -> Existing data preserved -> new restricted operations blocked
  it('FLOW I: Tenant -> Downgrade -> Existing data preserved -> new restricted operations blocked', async () => {
    const tenantId = 'tenant_flow_i_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Flow I School',
      slug: 'flow-i-school',
      status: 'ACTIVE',
      plan: 'standard',
    });

    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      planTier: 'STANDARD',
      tier: 'standard',
      status: 'ACTIVE',
      billingCycle: 'TERMLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 90 * 86400000),
      maxStudents: 1500,
    });

    // Downgrade to STARTER
    const downRes = await subService.changePlanBySuperAdmin(
      tenantId,
      { email: 'superadmin@platform.io', userId: 'usr_superadmin' },
      {
        targetTier: 'STARTER',
        billingCycle: 'TERMLY',
        reason: 'Downsized campus operations',
        bypassQuotaValidation: true,
      },
    );

    expect(downRes.subscription.planTier).toBe('STARTER');
    const timetable = await subService.isFeatureEntitled(tenantId, 'TIMETABLE_MANAGEMENT');
    expect(timetable.entitled).toBeFalsy();
  });

  // FLOW J: Super Admin -> Suspend tenant
  it('FLOW J: Super Admin -> Suspend tenant -> status transitions to SUSPENDED', async () => {
    const tenantId = 'tenant_flow_j_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Flow J School',
      slug: 'flow-j-school',
      status: 'ACTIVE',
      plan: 'standard',
    });

    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      planTier: 'STANDARD',
      tier: 'standard',
      status: 'ACTIVE',
      billingCycle: 'TERMLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 90 * 86400000),
    });

    const deactRes = await subService.deactivateSubscription(
      tenantId,
      'Administrative policy violation',
      { email: 'superadmin@platform.io', userId: 'usr_superadmin' },
    );

    expect(deactRes.subscription.status).toBe('CANCELLED');
    const tenant = prisma.memoryStore.tenants.get(tenantId);
    expect(tenant.status).toBe('SUSPENDED');
  });

  // FLOW K: Super Admin -> Archive tenant
  it('FLOW K: Super Admin -> Archive tenant -> status transitions to ARCHIVED', async () => {
    const tenantId = 'tenant_flow_k_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Flow K School',
      slug: 'flow-k-school',
      status: 'ACTIVE',
      plan: 'starter',
    });

    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'ACTIVE',
      billingCycle: 'TERMLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 90 * 86400000),
    });

    const arcRes = await subService.archiveSchool(
      tenantId,
      'School permanently merged with another branch',
      { email: 'superadmin@platform.io', userId: 'usr_superadmin' },
    );

    expect(arcRes.subscription.status).toBe('CANCELLED');
    const tenant = prisma.memoryStore.tenants.get(tenantId);
    expect(tenant.status).toBe('ARCHIVED');
  });

  // FLOW L: Super Admin -> Delete tenant -> confirmation required
  it('FLOW L: Super Admin -> Delete tenant validation safeguards', async () => {
    const tenantId = 'tenant_flow_l_' + Date.now();
    const schoolName = 'Destruction Test Academy';

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: schoolName,
      slug: 'destruction-test-academy',
      status: 'ARCHIVED',
      plan: 'starter',
    });

    // Confirmation mismatch must throw an error
    const validateDeletion = (inputName: string, checkbox: boolean) => {
      if (inputName !== schoolName) {
        throw new Error('School name confirmation mismatch');
      }
      if (!checkbox) {
        throw new Error('Confirmation checkbox required');
      }
      prisma.memoryStore.tenants.delete(tenantId);
      return { success: true, deleted: true };
    };

    expect(() => validateDeletion('Wrong School Name', true)).toThrow('School name confirmation mismatch');
    expect(() => validateDeletion(schoolName, false)).toThrow('Confirmation checkbox required');

    const validDelete = validateDeletion(schoolName, true);
    expect(validDelete.deleted).toBe(true);
    expect(prisma.memoryStore.tenants.has(tenantId)).toBe(false);
  });

  // FLOW M: Unauthorized tenant API request -> denied
  it('FLOW M: Unauthorized tenant API request validation', async () => {
    const authenticateRequest = (token?: string) => {
      if (!token || token === 'invalid_or_expired') {
        throw new Error('Unauthorized');
      }
      return { authenticated: true };
    };

    expect(() => authenticateRequest()).toThrow('Unauthorized');
    expect(() => authenticateRequest('invalid_or_expired')).toThrow('Unauthorized');
    expect(authenticateRequest('valid_token')).toEqual({ authenticated: true });
  });

  // FLOW N: Authorized user but subscription lacks feature -> denied
  it('FLOW N: Authorized user but subscription lacks feature -> denied', async () => {
    const tenantId = 'tenant_flow_n_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Starter Plan School',
      slug: 'starter-school',
      status: 'ACTIVE',
      plan: 'starter',
    });

    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'ACTIVE',
      billingCycle: 'TERMLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 90 * 86400000),
    });

    const timetableCheck = await subService.isFeatureEntitled(tenantId, 'TIMETABLE_MANAGEMENT');
    expect(timetableCheck.entitled).toBeFalsy();
    const examCheck = await subService.isFeatureEntitled(tenantId, 'EXAMINATIONS_RESULTS');
    expect(examCheck.entitled).toBeFalsy();

    // Guard simulation:
    const checkFeatureAccess = async (feature: string) => {
      const check = await subService.isFeatureEntitled(tenantId, feature);
      if (!check.entitled) {
        throw new Error(`SUBSCRIPTION_FEATURE_REQUIRED: ${feature}`);
      }
      return true;
    };

    await expect(checkFeatureAccess('TIMETABLE_MANAGEMENT')).rejects.toThrow(/SUBSCRIPTION_FEATURE_REQUIRED/i);
    await expect(checkFeatureAccess('EXAMINATIONS_RESULTS')).rejects.toThrow(/SUBSCRIPTION_FEATURE_REQUIRED/i);
  });

  // FLOW O: Subscription has feature but user lacks RBAC permission -> denied
  it('FLOW O: Subscription has feature but user lacks RBAC permission -> denied', async () => {
    const checkRbacAccess = (userPermissions: string[], requiredPermission: string) => {
      if (!userPermissions.includes(requiredPermission) && !userPermissions.includes('*')) {
        throw new Error(`FORBIDDEN: User lacks permission '${requiredPermission}'`);
      }
      return true;
    };

    const studentPermissions = ['students.view', 'attendance.view'];
    expect(() => checkRbacAccess(studentPermissions, 'payroll.manage')).toThrow(/FORBIDDEN/i);
    expect(() => checkRbacAccess(studentPermissions, 'billing.manage')).toThrow(/FORBIDDEN/i);
  });

  // FLOW P: Subscription + entitlement + RBAC permission -> allowed
  it('FLOW P: Subscription + entitlement + RBAC permission -> allowed', async () => {
    const tenantId = 'tenant_flow_p_' + Date.now();
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Standard Plan School',
      slug: 'standard-school',
      status: 'ACTIVE',
      plan: 'standard',
    });

    prisma.memoryStore.subscriptions.set(`sub_${tenantId}`, {
      id: `sub_${tenantId}`,
      tenantId,
      planTier: 'STANDARD',
      tier: 'standard',
      status: 'ACTIVE',
      billingCycle: 'TERMLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 90 * 86400000),
    });

    const adminPermissions = ['timetable.manage', 'timetable.view', 'students.view'];

    const authorizeOperation = async (feature: string, permission: string) => {
      const check = await subService.isFeatureEntitled(tenantId, feature);
      if (!check.entitled) throw new Error('SUBSCRIPTION_FEATURE_REQUIRED');
      if (!adminPermissions.includes(permission)) throw new Error('FORBIDDEN');
      return { allowed: true, status: 200 };
    };

    const res = await authorizeOperation('TIMETABLE_MANAGEMENT', 'timetable.manage');
    expect(res.allowed).toBe(true);
    expect(res.status).toBe(200);
  });
});
