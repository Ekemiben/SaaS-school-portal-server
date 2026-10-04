import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service.js';
import { TenantLifecycleService } from '../src/modules/subscriptions/tenant-lifecycle.service.js';
import { TenancyService } from '../src/modules/tenancy/tenancy.service.js';
import { CustomDomainService } from '../src/modules/tenancy/custom-domain.service.js';
import { CloudflareDomainProvider } from '../src/modules/tenancy/cloudflare-domain.provider.js';
import { ForbiddenException } from '@nestjs/common';

describe('Step 16: Trial Expiration, Lifecycle Enforcement & Feature Access (Deterministic Tests)', () => {
  let prisma: PrismaService;
  let subService: SubscriptionsService;
  let lifecycleService: TenantLifecycleService;
  let tenancyService: TenancyService;

  beforeEach(() => {
    prisma = new PrismaService();
    subService = new SubscriptionsService(prisma);
    lifecycleService = new TenantLifecycleService(prisma, subService);
    const domainProvider = new CloudflareDomainProvider();
    const customDomainService = new CustomDomainService(prisma, domainProvider);
    tenancyService = new TenancyService(prisma, customDomainService);
  });

  // SCENARIO 1: NEW TRIAL (Tenant receives 2 months free trial)
  it('Scenario 1: Newly registered tenant receives a 2-month (60 days) free trial', async () => {
    const regResult = await tenancyService.registerSchool({
      schoolName: 'New Horizon College',
      slug: 'horizon-test-' + Date.now(),
      ownerEmail: 'admin@horizon.edu.ng',
      planTier: 'STARTER',
      billingCycle: 'TERMLY',
      paymentOption: 'pay_later',
    });

    expect(regResult).toBeDefined();
    expect(regResult.status).toBe('TRIAL');

    const sub = regResult.subscription;
    expect(sub).toBeDefined();
    expect(sub.status).toBe('TRIAL');
    expect(sub.planTier).toBe('STARTER');
    expect(sub.trialEndsAt).toBeDefined();

    const now = Date.now();
    const trialEndMs = new Date(sub.trialEndsAt!).getTime();
    const diffDays = Math.round((trialEndMs - now) / 86400000);
    expect(diffDays).toBe(60);
  });

  // SCENARIO 2: BEFORE EXPIRATION (Tenant retains full trial access)
  it('Scenario 2: Tenant retains trial access before expiration (trialEndsAt in future)', async () => {
    const tenantId = 'tenant_active_trial_' + Date.now();
    const futureDate = new Date(Date.now() + 45 * 86400000);

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'St. Claire Academy',
      status: 'TRIAL',
      plan: 'starter',
    });

    prisma.memoryStore.subscriptions.set('sub_' + tenantId, {
      id: 'sub_' + tenantId,
      tenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'TRIAL',
      trialEndsAt: futureDate,
      currentPeriodEnd: futureDate,
    });

    const opCheck = await lifecycleService.checkTenantOperationAllowed(tenantId);
    expect(opCheck.allowed).toBe(true);
    expect(opCheck.status).toBe('TRIAL');

    const featureCheck = await subService.isFeatureEntitled(tenantId, 'STUDENT_MANAGEMENT');
    expect(featureCheck.entitled).toBe(true);
    expect(featureCheck.reason).toBe('AUTHORIZED');
  });

  // SCENARIO 3: EXPIRATION (Trial transitions to EXPIRED/SUSPENDED)
  it('Scenario 3: Trial transitions to EXPIRED and tenant to SUSPENDED once trialEndsAt has elapsed', async () => {
    const tenantId = 'tenant_expired_trial_' + Date.now();
    const pastDate = new Date(Date.now() - 2 * 86400000);

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Apex Academy',
      status: 'TRIAL',
      plan: 'starter',
    });

    prisma.memoryStore.subscriptions.set('sub_' + tenantId, {
      id: 'sub_' + tenantId,
      tenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'TRIAL',
      trialEndsAt: pastDate,
      currentPeriodEnd: pastDate,
    });

    const enforcement = await lifecycleService.enforceTenantLifecycles();
    expect(enforcement.expiredTrials.some((t) => t.tenantId === tenantId)).toBe(true);

    const sub = prisma.memoryStore.subscriptions.get('sub_' + tenantId);
    expect(sub.status).toBe('EXPIRED');

    const tenant = prisma.memoryStore.tenants.get(tenantId);
    expect(tenant.status).toBe('SUSPENDED');

    expect(() => lifecycleService.checkTenantOperationAllowed(tenantId)).toThrow(ForbiddenException);

    const featureCheck = await subService.isFeatureEntitled(tenantId, 'STUDENT_MANAGEMENT');
    expect(featureCheck.entitled).toBe(false);
    expect(featureCheck.reason).toMatch(/SUBSCRIPTION_(EXPIRED|SUSPENDED)/);
  });

  // SCENARIO 4: PAYMENT BEFORE EXPIRATION (Tenant becomes ACTIVE, clears trialEndsAt)
  it('Scenario 4: Payment before expiration transitions tenant to ACTIVE and clears trialEndsAt', async () => {
    const tenantId = 'tenant_pay_before_' + Date.now();
    const futureDate = new Date(Date.now() + 30 * 86400000);

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Beacon High School',
      status: 'TRIAL',
      plan: 'starter',
    });

    prisma.memoryStore.subscriptions.set('sub_' + tenantId, {
      id: 'sub_' + tenantId,
      tenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'TRIAL',
      trialEndsAt: futureDate,
      currentPeriodEnd: futureDate,
    });

    const activation = await lifecycleService.activateSubscription(tenantId, {
      planTier: 'STARTER',
      billingCycle: 'TERMLY',
      durationDays: 90,
    });

    expect(activation.success).toBe(true);

    const sub = prisma.memoryStore.subscriptions.get('sub_' + tenantId);
    expect(sub.status).toBe('ACTIVE');
    expect(sub.trialEndsAt).toBeNull();

    const tenant = prisma.memoryStore.tenants.get(tenantId);
    expect(tenant.status).toBe('ACTIVE');

    const opCheck = await lifecycleService.checkTenantOperationAllowed(tenantId);
    expect(opCheck.allowed).toBe(true);
    expect(opCheck.status).toBe('ACTIVE');
  });

  // SCENARIO 5: PAYMENT AFTER EXPIRATION (Reactivation and Upgrade)
  it('Scenario 5: Tenant can pay/upgrade after expiration and becomes ACTIVE upon successful verification', async () => {
    const tenantId = 'tenant_pay_after_' + Date.now();
    const pastDate = new Date(Date.now() - 5 * 86400000);

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Crestview Grammar School',
      status: 'SUSPENDED',
      plan: 'starter',
    });

    prisma.memoryStore.subscriptions.set('sub_' + tenantId, {
      id: 'sub_' + tenantId,
      tenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'EXPIRED',
      trialEndsAt: pastDate,
      currentPeriodEnd: pastDate,
    });

    await expect(lifecycleService.checkTenantOperationAllowed(tenantId)).rejects.toThrow(ForbiddenException);

    const activation = await lifecycleService.activateSubscription(tenantId, {
      planTier: 'STANDARD',
      billingCycle: 'TERMLY',
      durationDays: 90,
    });

    expect(activation.success).toBe(true);

    const sub = prisma.memoryStore.subscriptions.get('sub_' + tenantId);
    expect(sub.status).toBe('ACTIVE');
    expect(sub.planTier).toBe('STANDARD');
    expect(sub.trialEndsAt).toBeNull();

    const tenant = prisma.memoryStore.tenants.get(tenantId);
    expect(tenant.status).toBe('ACTIVE');
    expect(tenant.plan).toBe('standard');

    const opCheck = await lifecycleService.checkTenantOperationAllowed(tenantId);
    expect(opCheck.allowed).toBe(true);
    expect(opCheck.status).toBe('ACTIVE');

    const standardFeature = await subService.isFeatureEntitled(tenantId, 'TIMETABLE_MANAGEMENT');
    expect(standardFeature.entitled).toBe(true);
  });

  // SCENARIO 6: INCENTIVE DURING TRIAL (Promotional Feature Override)
  it('Scenario 6: Promotional feature incentive works correctly during active trial', async () => {
    const tenantId = 'tenant_incentive_trial_' + Date.now();
    const futureTrial = new Date(Date.now() + 50 * 86400000);

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Dynamic Prep School',
      status: 'TRIAL',
      plan: 'starter',
    });

    prisma.memoryStore.subscriptions.set('sub_' + tenantId, {
      id: 'sub_' + tenantId,
      tenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'TRIAL',
      trialEndsAt: futureTrial,
      currentPeriodEnd: futureTrial,
    });

    const initialCheck = await subService.isFeatureEntitled(tenantId, 'TIMETABLE_MANAGEMENT');
    expect(initialCheck.entitled).toBe(false);
    expect(initialCheck.reason).toBe('FEATURE_NOT_IN_TIER');

    const overrideExpiry = new Date(Date.now() + 14 * 86400000);
    const grantRes = await subService.grantTenantIncentive(tenantId, {
      featureKey: 'TIMETABLE_MANAGEMENT',
      isEnabled: true,
      expiresAt: overrideExpiry.toISOString(),
      reason: '2-Week Free Trial of Timetable Management',
    });

    expect(grantRes.success).toBe(true);

    const incentiveCheck = await subService.isFeatureEntitled(tenantId, 'TIMETABLE_MANAGEMENT');
    expect(incentiveCheck.entitled).toBe(true);
    expect(incentiveCheck.reason).toBe('AUTHORIZED');

    const subInfo = await subService.getSubscription(tenantId);
    expect(subInfo.hasIncentives).toBe(true);
    expect(subInfo.incentives.some((i) => i.featureKey === 'TIMETABLE_MANAGEMENT')).toBe(true);
  });

  // SCENARIO 7: INCENTIVE EXPIRATION (Promotional Override Stops Working)
  it('Scenario 7: Promotional feature incentive stops working upon expiration', async () => {
    const tenantId = 'tenant_incentive_exp_' + Date.now();
    const futureTrial = new Date(Date.now() + 50 * 86400000);
    const subId = 'sub_' + tenantId;

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Elite Scholars Academy',
      status: 'TRIAL',
      plan: 'starter',
    });

    prisma.memoryStore.subscriptions.set(subId, {
      id: subId,
      tenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'TRIAL',
      trialEndsAt: futureTrial,
      currentPeriodEnd: futureTrial,
    });

    const pastExpiry = new Date(Date.now() - 3600 * 1000);
    prisma.memoryStore.featureOverrides.set(subId + '_TIMETABLE_MANAGEMENT', {
      id: 'sfo_test_exp',
      tenantId,
      subscriptionId: subId,
      featureKey: 'TIMETABLE_MANAGEMENT',
      isEnabled: true,
      expiresAt: pastExpiry,
      reason: 'Expired Promotional Override',
      createdAt: new Date(Date.now() - 7 * 86400000),
      updatedAt: new Date(Date.now() - 7 * 86400000),
    });

    const enforcement = await lifecycleService.enforceTenantLifecycles();
    expect(enforcement.expiredIncentives.some((i) => i.tenantId === tenantId && i.featureKey === 'TIMETABLE_MANAGEMENT')).toBe(true);

    const override = prisma.memoryStore.featureOverrides.get(subId + '_TIMETABLE_MANAGEMENT');
    expect(override.isEnabled).toBe(false);

    const check = await subService.isFeatureEntitled(tenantId, 'TIMETABLE_MANAGEMENT');
    expect(check.entitled).toBe(false);
    expect(check.reason).toBe('FEATURE_NOT_IN_TIER');
  });

  // SCENARIO 8: TRIAL TENANT FEATURE ACCESS POLICY
  it('Scenario 8: Trial feature access strictly matches approved plan tier policy', async () => {
    // 1. STARTER TRIAL TENANT
    const starterTenantId = 'tenant_policy_starter_' + Date.now();
    const futureTrial = new Date(Date.now() + 60 * 86400000);

    prisma.memoryStore.tenants.set(starterTenantId, {
      id: starterTenantId,
      name: 'Starter Trial High',
      status: 'TRIAL',
      plan: 'starter',
    });

    prisma.memoryStore.subscriptions.set('sub_' + starterTenantId, {
      id: 'sub_' + starterTenantId,
      tenantId: starterTenantId,
      planTier: 'STARTER',
      tier: 'starter',
      status: 'TRIAL',
      trialEndsAt: futureTrial,
      currentPeriodEnd: futureTrial,
    });

    // Starter trial includes core features
    const starterCore = await subService.isFeatureEntitled(starterTenantId, 'STUDENT_MANAGEMENT');
    expect(starterCore.entitled).toBe(true);

    const starterAttendance = await subService.isFeatureEntitled(starterTenantId, 'ATTENDANCE_BASIC');
    expect(starterAttendance.entitled).toBe(true);

    // Starter trial rejects higher tier features
    const starterExam = await subService.isFeatureEntitled(starterTenantId, 'EXAMINATIONS_RESULTS');
    expect(starterExam.entitled).toBe(false);
    expect(starterExam.reason).toBe('FEATURE_NOT_IN_TIER');

    const starterPayroll = await subService.isFeatureEntitled(starterTenantId, 'ADVANCED_PAYROLL');
    expect(starterPayroll.entitled).toBe(false);
    expect(starterPayroll.reason).toBe('FEATURE_NOT_IN_TIER');

    // 2. STANDARD TRIAL TENANT
    const standardTenantId = 'tenant_policy_standard_' + Date.now();
    prisma.memoryStore.tenants.set(standardTenantId, {
      id: standardTenantId,
      name: 'Standard Trial Grammar',
      status: 'TRIAL',
      plan: 'standard',
    });

    prisma.memoryStore.subscriptions.set('sub_' + standardTenantId, {
      id: 'sub_' + standardTenantId,
      tenantId: standardTenantId,
      planTier: 'STANDARD',
      tier: 'standard',
      status: 'TRIAL',
      trialEndsAt: futureTrial,
      currentPeriodEnd: futureTrial,
    });

    // Standard trial includes Starter features + Standard features
    const standardCore = await subService.isFeatureEntitled(standardTenantId, 'STUDENT_MANAGEMENT');
    expect(standardCore.entitled).toBe(true);

    const standardExam = await subService.isFeatureEntitled(standardTenantId, 'EXAMINATIONS_RESULTS');
    expect(standardExam.entitled).toBe(true);

    const standardTimetable = await subService.isFeatureEntitled(standardTenantId, 'TIMETABLE_MANAGEMENT');
    expect(standardTimetable.entitled).toBe(true);

    // Standard trial rejects Premium features
    const standardPayroll = await subService.isFeatureEntitled(standardTenantId, 'ADVANCED_PAYROLL');
    expect(standardPayroll.entitled).toBe(false);
    expect(standardPayroll.reason).toBe('FEATURE_NOT_IN_TIER');

    const standardBiometric = await subService.isFeatureEntitled(standardTenantId, 'BIOMETRIC_ATTENDANCE');
    expect(standardBiometric.entitled).toBe(false);
    expect(standardBiometric.reason).toBe('FEATURE_NOT_IN_TIER');
  });
});