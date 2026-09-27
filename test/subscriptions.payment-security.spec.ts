import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { PrismaService } from '../src/database/prisma.service.js';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service.js';
import { SubscriptionPaymentsService } from '../src/modules/billing/subscription-payments.service.js';
import { PaystackPaymentAdapter } from '../src/modules/payments/adapters/paystack.adapter.js';
import { FlutterwavePaymentAdapter } from '../src/modules/payments/adapters/flutterwave.adapter.js';

describe('Step 17: Payment Security & Idempotency Audit Suite', () => {
  let prisma: PrismaService;
  let subService: SubscriptionsService;
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

  const tenantA = 'tenant_school_alpha_' + Date.now();
  const tenantB = 'tenant_school_beta_' + Date.now();

  beforeEach(async () => {
    prisma = new PrismaService();
    subService = new SubscriptionsService(prisma);
    paystackAdapter = new PaystackPaymentAdapter(mockConfigService);
    flutterwaveAdapter = new FlutterwavePaymentAdapter(mockConfigService);
    paymentsService = new SubscriptionPaymentsService(
      prisma,
      paystackAdapter,
      flutterwaveAdapter,
      subService,
    );

    // Initialize in-memory tenants
    prisma.memoryStore.tenants.set(tenantA, {
      id: tenantA,
      name: 'School Alpha',
      slug: 'school-alpha',
      status: 'TRIAL',
      plan: 'starter',
    });
    prisma.memoryStore.tenants.set(tenantB, {
      id: tenantB,
      name: 'School Beta',
      slug: 'school-beta',
      status: 'TRIAL',
      plan: 'starter',
    });
  });

  // CRITERION 1: Webhook Signature Verification
  it('Criterion 1: Should reject unsigned or incorrectly signed webhook payloads with HTTP 400', async () => {
    const rawPayload = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'REF_TEST_001', amount: 35000000 },
    });

    // 1. Missing signature
    await expect(
      paymentsService.handlePaystackWebhook('', JSON.parse(rawPayload), rawPayload),
    ).rejects.toThrow('Invalid or unsigned Paystack webhook signature');

    // 2. Tampered / incorrect signature
    const forgedSignature = 'c0ffee0000000000000000000000000000000000000000000000000000000000deadbeef';
    await expect(
      paymentsService.handlePaystackWebhook(forgedSignature, JSON.parse(rawPayload), rawPayload),
    ).rejects.toThrow('Invalid or unsigned Paystack webhook signature');

    // 3. Valid HMAC SHA512 signature is accepted
    const validSignature = crypto
      .createHmac('sha512', 'whsec_paystack_test_secret')
      .update(rawPayload)
      .digest('hex');

    const result = await paymentsService.handlePaystackWebhook(
      validSignature,
      JSON.parse(rawPayload),
      rawPayload,
    );
    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.received).toBe(true);
  });

  // CRITERION 2 & 4: Duplicate Webhook Protection & Transaction Idempotency
  it('Criterion 2 & 4: Repeated calls with same payment reference must be strictly idempotent', async () => {
    const reference = 'REF_IDEMP_' + Date.now();

    // Setup an initiated payment
    prisma.memoryStore.subscriptionPayments.set(`spay_${reference}`, {
      id: `spay_${reference}`,
      tenantId: tenantA,
      providerReference: reference,
      amount: 350000,
      currency: 'NGN',
      status: 'INITIATED',
      metadata: { planTier: 'STANDARD', billingCycle: 'TERMLY' },
    });

    // Mock verifyPayment in paystackAdapter
    paystackAdapter.verifyPayment = async () => ({
      success: true,
      reference,
      amount: 350000,
      currency: 'NGN',
      status: 'successful',
      paidAt: new Date(),
      channel: 'card',
      gatewayResponse: 'Approved',
      rawPayload: { metadata: { tenantId: tenantA } },
    });

    // 1. First verification
    const res1 = await paymentsService.verifyOnlinePayment(tenantA, reference);
    expect(res1.success).toBe(true);
    expect(res1.payment.status).toBe('SUCCESSFUL');
    const firstPeriodEnd = res1.subscription.currentPeriodEnd;

    // 2. Second verification (Idempotency Replay)
    const res2 = await paymentsService.verifyOnlinePayment(tenantA, reference);
    expect(res2.success).toBe(true);
    expect(res2.alreadyProcessed).toBe(true);
    expect(res2.message).toContain('already been successfully verified');
    expect(res2.payment.id).toBe(res1.payment.id);
    expect(res2.subscription.currentPeriodEnd.getTime()).toBe(firstPeriodEnd.getTime());
  });

  // CRITERION 5: Amount Verification (Underpayment Rejection)
  it('Criterion 5: Underpayment must NEVER activate a subscription', async () => {
    const reference = 'REF_UNDERPAY_' + Date.now();

    // Standard plan requires 350,000 NGN
    prisma.memoryStore.subscriptionPayments.set(`spay_${reference}`, {
      id: `spay_${reference}`,
      tenantId: tenantA,
      providerReference: reference,
      amount: 350000,
      currency: 'NGN',
      status: 'INITIATED',
      metadata: { planTier: 'STANDARD', billingCycle: 'TERMLY' },
    });

    // Attacker only paid 1,000 NGN
    paystackAdapter.verifyPayment = async () => ({
      success: true,
      reference,
      amount: 1000, // UNDERPAYMENT!
      currency: 'NGN',
      status: 'successful',
      paidAt: new Date(),
      channel: 'card',
      gatewayResponse: 'Approved',
      rawPayload: { metadata: { tenantId: tenantA } },
    });

    await expect(paymentsService.verifyOnlinePayment(tenantA, reference)).rejects.toThrow(
      /Underpayment rejected/i,
    );

    // Verify tenant plan remained unchanged
    const tenant = prisma.memoryStore.tenants.get(tenantA);
    expect(tenant.plan).toBe('starter');
  });

  // CRITERION 6: Currency Verification
  it('Criterion 6: Currency mismatch must be strictly rejected', async () => {
    const reference = 'REF_CURR_MISMATCH_' + Date.now();

    prisma.memoryStore.subscriptionPayments.set(`spay_${reference}`, {
      id: `spay_${reference}`,
      tenantId: tenantA,
      providerReference: reference,
      amount: 350000,
      currency: 'NGN',
      status: 'INITIATED',
      metadata: { planTier: 'STANDARD', billingCycle: 'TERMLY' },
    });

    // Attacker paid in USD instead of NGN
    paystackAdapter.verifyPayment = async () => ({
      success: true,
      reference,
      amount: 350000,
      currency: 'USD', // CURRENCY MISMATCH!
      status: 'successful',
      paidAt: new Date(),
      channel: 'card',
      gatewayResponse: 'Approved',
      rawPayload: { metadata: { tenantId: tenantA } },
    });

    await expect(paymentsService.verifyOnlinePayment(tenantA, reference)).rejects.toThrow(
      /Currency mismatch rejected/i,
    );
  });

  // CRITERION 7 & 8: Tenant & Subscription Ownership Verification
  it('Criterion 7 & 8: Cross-tenant payment reference hijacking must be rejected with ForbiddenException', async () => {
    const reference = 'REF_CROSS_TENANT_' + Date.now();

    // Payment legitimately initiated by School Alpha (tenantA)
    prisma.memoryStore.subscriptionPayments.set(`spay_${reference}`, {
      id: `spay_${reference}`,
      tenantId: tenantA,
      providerReference: reference,
      amount: 350000,
      currency: 'NGN',
      status: 'INITIATED',
      metadata: { planTier: 'STANDARD', billingCycle: 'TERMLY' },
    });

    // School Beta (tenantB) attempts to claim tenantA's payment reference!
    await expect(paymentsService.verifyOnlinePayment(tenantB, reference)).rejects.toThrow(
      'Cross-tenant payment violation: Payment reference belongs to a different school organization.',
    );
  });

  // CRITERION 9: Invoice Ownership Verification
  it('Criterion 9: Invoices must belong strictly to the paying tenant', async () => {
    const invoiceOfTenantB = 'binv_beta_' + Date.now();
    prisma.memoryStore.billingInvoices.set(invoiceOfTenantB, {
      id: invoiceOfTenantB,
      tenantId: tenantB, // belongs to School Beta
      invoiceNumber: 'INV-BETA-001',
      amount: 350000,
      currency: 'NGN',
      status: 'PENDING',
    });

    // School Alpha attempts to initialize a payment using School Beta's invoice ID
    await expect(
      paymentsService.initializeOnlinePayment(tenantA, 'alpha@school.portal', {
        planTier: 'STANDARD',
        billingCycle: 'TERMLY',
        invoiceId: invoiceOfTenantB,
      }),
    ).rejects.toThrow(/Cross-tenant invoice violation/i);
  });

  // CRITERION 10: Replay Protection & Source-of-Truth Gateway Verification
  it('Criterion 10: Webhook payload is NEVER trusted without successful upstream gateway verification', async () => {
    const reference = 'REF_FAKE_STATUS_' + Date.now();

    prisma.memoryStore.subscriptionPayments.set(`spay_${reference}`, {
      id: `spay_${reference}`,
      tenantId: tenantA,
      providerReference: reference,
      amount: 350000,
      currency: 'NGN',
      status: 'INITIATED',
      metadata: { planTier: 'STANDARD', billingCycle: 'TERMLY' },
    });

    // Upstream gateway returns failed or declined transaction
    paystackAdapter.verifyPayment = async () => ({
      success: false,
      reference,
      amount: 0,
      currency: 'NGN',
      status: 'failed',
      gatewayResponse: 'Declined by issuer',
      rawPayload: {},
    });

    // Webhook claims "charge.success", but gateway verification reports failed!
    const rawPayload = JSON.stringify({
      event: 'charge.success',
      data: {
        reference,
        amount: 35000000,
        currency: 'NGN',
        metadata: { tenantId: tenantA },
      },
    });

    const validSignature = crypto
      .createHmac('sha512', 'whsec_paystack_test_secret')
      .update(rawPayload)
      .digest('hex');

    const webhookRes = await paymentsService.handlePaystackWebhook(
      validSignature,
      JSON.parse(rawPayload),
      rawPayload,
    );

    // The webhook returns error status because gateway rejected transaction!
    expect(webhookRes.status).toBe('error');
    expect(webhookRes.message).toContain('Payment verification failed');

    // Tenant A subscription remains inactive
    const tenant = prisma.memoryStore.tenants.get(tenantA);
    expect(tenant.plan).toBe('starter');
  });

  // FLUTTERWAVE: Signature Verification & Webhook Handling
  it('Flutterwave: Validates secret hash and rejects invalid signatures', async () => {
    const payload = {
      event: 'charge.completed',
      data: { tx_ref: 'FLW_REF_001', amount: 350000, meta: { tenantId: tenantA } },
    };

    // 1. Invalid secret hash
    await expect(
      paymentsService.handleFlutterwaveWebhook('wrong_hash', payload),
    ).rejects.toThrow('Invalid or unsigned Flutterwave webhook signature');

    // 2. Valid secret hash
    const res = await paymentsService.handleFlutterwaveWebhook(
      'flutterwave_test_secret_hash',
      payload,
    );
    expect(res).toBeDefined();
    expect(res.received).toBe(true);
  });
});
