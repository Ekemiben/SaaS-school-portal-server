import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { PaystackPaymentAdapter } from '../payments/adapters/paystack.adapter.js';
import { FlutterwavePaymentAdapter } from '../payments/adapters/flutterwave.adapter.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import {
  InitializeSubscriptionPaymentDto,
  InitiateBankTransferDto,
  SubmitBankTransferProofDto,
  RecordManualPaymentDto,
} from './dto/subscription-payment-flow.dto.js';

@Injectable()
export class SubscriptionPaymentsService {
  private readonly logger = new Logger(SubscriptionPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackAdapter: PaystackPaymentAdapter,
    private readonly flutterwaveAdapter: FlutterwavePaymentAdapter,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Online Payment: Initializes a Paystack transaction for SaaS school subscription.
   * Calculates price with 6% yearly discount if ANNUAL cycle is selected.
   */
  async initializeOnlinePayment(
    tenantId: string,
    userEmail: string,
    dto: InitializeSubscriptionPaymentDto,
  ) {
    const targetTier = (dto.planTier || 'STANDARD').toUpperCase();
    const cycle = (dto.billingCycle || 'TERMLY').toUpperCase();
    const isAnnual = cycle === 'ANNUAL' || cycle === 'YEARLY';

    // 1. Fetch Plan Details from PostgreSQL
    let plan = await this.prisma.subscriptionPlan.findUnique({
      where: { tier: targetTier },
    });
    if (!plan) {
      plan = await this.prisma.subscriptionPlan.findFirst();
    }

    const price = isAnnual
      ? Number(plan?.annualPrice || 987000)
      : Number(plan?.termlyPrice || 350000);

    const termlyFull = Number(plan?.termlyPrice || 350000) * 3;
    const discount = isAnnual ? termlyFull - price : 0;
    const now = new Date();

    // 2. Find or generate BillingInvoice with strict tenant ownership validation
    let invoice = null;
    if (dto.invoiceId) {
      const existingInv = await this.prisma.billingInvoice.findUnique({
        where: { id: dto.invoiceId },
      });
      if (!existingInv) {
        throw new NotFoundException(`Specified billing invoice '${dto.invoiceId}' does not exist.`);
      }
      if (existingInv.tenantId !== tenantId) {
        throw new ForbiddenException('Cross-tenant invoice violation: Specified billing invoice belongs to a different school organization.');
      }
      invoice = existingInv;
    }

    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });

    if (!invoice) {
      const invoiceNumber = `SUB-INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      invoice = await this.prisma.billingInvoice.create({
        data: {
          id: `binv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId,
          subscriptionId: sub?.id || null,
          invoiceNumber,
          amount: price,
          currency: plan?.currency || 'NGN',
          status: 'PENDING',
          dueDate: new Date(now.getTime() + 7 * 86400000),
          lineItems: [
            {
              description: `${plan?.name || targetTier} Subscription (${isAnnual ? 'ANNUAL (Save 6%)' : 'TERMLY'})`,
              amount: price,
              quantity: 1,
              subtotal: isAnnual ? termlyFull : price,
              discountApplied: discount,
              discountPercentage: isAnnual ? Number((plan as any)?.yearlyDiscountPercentage ?? (plan as any)?.yearlyDiscountPercent ?? 6) : 0,
            },
          ],
        },
      });
    }

    // 3. Create SubscriptionPayment record with INITIATED status
    const reference = `SUB-PSTK-${tenantId.substring(0, 8)}-${Date.now()}`;
    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        id: `spay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        subscriptionId: sub?.id || null,
        billingInvoiceId: invoice.id,
        amount: price,
        currency: plan?.currency || 'NGN',
        paymentMethod: 'PAYSTACK',
        provider: 'PAYSTACK',
        providerReference: reference,
        status: 'INITIATED',
        metadata: {
          planTier: targetTier,
          billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
          invoiceId: invoice.id,
          customerEmail: userEmail,
          subtotal: isAnnual ? termlyFull : price,
          discountApplied: discount,
        },
      },
    });

    // 4. Call Paystack Adapter to initialize payment
    const callbackUrl = dto.callbackUrl || `/admin/billing/verify?ref=${reference}`;
    const paystackRes = await this.paystackAdapter.initializePayment({
      customerEmail: userEmail || 'admin@school.portal',
      amount: price,
      currency: plan?.currency || 'NGN',
      reference,
      callbackUrl,
      metadata: {
        tenantId,
        planTier: targetTier,
        billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
        invoiceId: invoice.id,
        paymentType: 'SAAS_SUBSCRIPTION',
      },
    });

    return {
      success: true,
      authorizationUrl: paystackRes.authorizationUrl,
      accessCode: paystackRes.accessCode,
      reference,
      amount: price,
      currency: plan?.currency || 'NGN',
      invoiceId: invoice.id,
      planTier: targetTier,
      billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
      discountApplied: discount,
    };
  }

  /**
   * Online Payment: Verifies Paystack/Flutterwave transaction with strict idempotency,
   * amount checking, cross-tenant protection, and audit logging.
   * If already verified, returns existing record without duplicate activations.
   */
  async verifyOnlinePayment(tenantId: string, reference: string) {
    if (!reference || typeof reference !== 'string' || reference.trim() === '') {
      throw new BadRequestException('A valid payment transaction reference is required.');
    }

    // 1. Idempotency Check & Cross-Tenant Ownership Guard
    const existingPayment = await this.prisma.subscriptionPayment.findFirst({
      where: { providerReference: reference },
      include: { tenant: true, subscription: true },
    });

    // Tenant Ownership Verification: Reject cross-tenant payment reference hijacking
    if (existingPayment && existingPayment.tenantId !== tenantId) {
      this.logger.warn(
        `Cross-tenant payment violation: Tenant '${tenantId}' attempted to verify reference '${reference}' belonging to Tenant '${existingPayment.tenantId}'`,
      );
      throw new ForbiddenException(
        'Cross-tenant payment violation: Payment reference belongs to a different school organization.',
      );
    }

    // Invoice Ownership Verification: Ensure invoice belongs strictly to paying tenant
    if (existingPayment?.billingInvoiceId) {
      const invCheck = await this.prisma.billingInvoice.findUnique({
        where: { id: existingPayment.billingInvoiceId },
      });
      if (invCheck && invCheck.tenantId !== tenantId) {
        throw new ForbiddenException(
          'Cross-tenant invoice violation: Linked invoice belongs to a different school organization.',
        );
      }
    }

    // Idempotency: If already SUCCESSFUL, return existing record idempotently without double-crediting
    if (existingPayment && existingPayment.status === 'SUCCESSFUL') {
      const invoice = existingPayment.billingInvoiceId
        ? await this.prisma.billingInvoice.findUnique({ where: { id: existingPayment.billingInvoiceId } })
        : null;

      await this.prisma.auditLog.create({
        data: {
          id: `aud_idemp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId,
          action: 'PAYMENT_REPLAY_ATTEMPT_IGNORED',
          resourceType: 'SubscriptionPayment',
          resourceId: reference,
          afterData: {
            reference,
            paymentId: existingPayment.id,
            status: existingPayment.status,
            alreadyProcessed: true,
            timestamp: new Date().toISOString(),
          },
        },
      }).catch(() => {});

      let sub = existingPayment.subscription;
      if (!sub && existingPayment.subscriptionId) {
        sub = await this.prisma.subscription.findUnique({ where: { id: existingPayment.subscriptionId } });
      }
      if (!sub) {
        sub = await this.prisma.subscription.findFirst({ where: { tenantId } });
      }

      return {
        success: true,
        alreadyProcessed: true,
        payment: existingPayment,
        subscription: sub,
        invoice,
        message: 'Payment has already been successfully verified and processed.',
      };
    }

    // 2. Query Gateway for Source-of-Truth Verification
    const adapter =
      existingPayment?.provider === 'FLUTTERWAVE' ? this.flutterwaveAdapter : this.paystackAdapter;
    const verifyRes = await adapter.verifyPayment(reference);
    if (!verifyRes.success || verifyRes.status !== 'successful') {
      if (existingPayment) {
        await this.prisma.subscriptionPayment.update({
          where: { id: existingPayment.id },
          data: { status: 'FAILED' },
        }).catch(() => {});
      }
      throw new BadRequestException(
        `Payment verification failed with provider: ${verifyRes.gatewayResponse || 'Transaction not approved'}`,
      );
    }

    // 3. Verify Gateway Metadata Tenant Ownership
    const gwMeta = (verifyRes.rawPayload as any)?.metadata || (verifyRes as any)?.metadata || {};
    if (gwMeta.tenantId && gwMeta.tenantId !== tenantId) {
      this.logger.warn(`Gateway metadata tenant mismatch: Expected '${tenantId}', got '${gwMeta.tenantId}'`);
      throw new ForbiddenException(
        'Cross-tenant payment violation: Gateway payment metadata does not match authenticated tenant.',
      );
    }

    const now = new Date();
    const meta = (existingPayment?.metadata as any) || gwMeta || {};
    const targetTier = (meta.planTier || 'STANDARD').toUpperCase();
    const cycle = (meta.billingCycle || 'TERMLY').toUpperCase();
    const isAnnual = cycle === 'ANNUAL' || cycle === 'YEARLY';
    const durationDays = isAnnual ? 365 : 90;
    const periodEnd = new Date(now.getTime() + durationDays * 86400000);

    let plan = await this.prisma.subscriptionPlan.findUnique({
      where: { tier: targetTier },
    });
    if (!plan) {
      plan = await this.prisma.subscriptionPlan.findFirst();
    }

    // 4. Strict Amount Verification: Underpayment Rejection
    const requiredAmount = Number(
      existingPayment?.amount ||
      (isAnnual ? plan?.annualPrice || 987000 : plan?.termlyPrice || 350000),
    );
    const actualPaidAmount = Number(verifyRes.amount);

    if (isNaN(actualPaidAmount) || actualPaidAmount < requiredAmount) {
      this.logger.warn(
        `Underpayment detected for tenant ${tenantId}, ref ${reference}: required ₦${requiredAmount}, received ₦${actualPaidAmount}`,
      );
      if (existingPayment) {
        await this.prisma.subscriptionPayment.update({
          where: { id: existingPayment.id },
          data: { status: 'FAILED' },
        }).catch(() => {});
      }
      throw new BadRequestException(
        `Underpayment rejected: Amount paid (₦${actualPaidAmount.toLocaleString()}) is less than required plan price (₦${requiredAmount.toLocaleString()}). Subscription cannot be activated.`,
      );
    }

    // 5. Currency Verification
    const expectedCurrency = (existingPayment?.currency || plan?.currency || 'NGN').toUpperCase();
    const actualCurrency = (verifyRes.currency || 'NGN').toUpperCase();
    if (actualCurrency !== expectedCurrency) {
      this.logger.warn(
        `Currency mismatch for tenant ${tenantId}, ref ${reference}: expected ${expectedCurrency}, got ${actualCurrency}`,
      );
      if (existingPayment) {
        await this.prisma.subscriptionPayment.update({
          where: { id: existingPayment.id },
          data: { status: 'FAILED' },
        }).catch(() => {});
      }
      throw new BadRequestException(
        `Currency mismatch rejected: Expected currency '${expectedCurrency}' but received '${actualCurrency}'.`,
      );
    }

    // 6. Subscription Ownership Verification
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });
    if (existingPayment?.subscriptionId && sub && existingPayment.subscriptionId !== sub.id) {
      throw new ForbiddenException(
        'Subscription ownership mismatch: Payment is bound to a different subscription.',
      );
    }
    const subId = sub?.id || `sub_${tenantId.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // 7. Atomically update Payment, Invoice, Subscription, Tenant, and AuditLog
    const [updatedSub, updatedPayment] = await this.prisma.$transaction([
      this.prisma.subscription.upsert({
        where: { id: subId },
        create: {
          id: subId,
          tenantId,
          planId: plan?.id,
          planTier: targetTier,
          status: 'ACTIVE',
          billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
          priceAtPurchase: actualPaidAmount,
          currency: expectedCurrency,
          trialEndsAt: null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          maxStudents: plan?.maxStudents || 1500,
          maxCampuses: plan?.maxCampuses || 3,
          maxStaff: plan?.maxStaff || 100,
          storageLimitMb: plan?.storageLimitMb || 25600,
          autoRenew: true,
        },
        update: {
          planId: plan?.id,
          planTier: targetTier,
          status: 'ACTIVE',
          billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
          priceAtPurchase: actualPaidAmount,
          trialEndsAt: null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          maxStudents: plan?.maxStudents,
          maxCampuses: plan?.maxCampuses,
          maxStaff: plan?.maxStaff,
          storageLimitMb: plan?.storageLimitMb,
          updatedAt: now,
        },
      }),

      this.prisma.subscriptionPayment.upsert({
        where: { id: existingPayment?.id || `spay_ref_${reference}` },
        create: {
          id: `spay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId,
          subscriptionId: subId,
          billingInvoiceId: existingPayment?.billingInvoiceId || null,
          amount: actualPaidAmount,
          currency: expectedCurrency,
          paymentMethod: existingPayment?.provider || 'PAYSTACK',
          provider: existingPayment?.provider || 'PAYSTACK',
          providerReference: reference,
          status: 'SUCCESSFUL',
          paidAt: now,
          verifiedAt: now,
          verifiedBy: 'GATEWAY_VERIFIED',
          metadata: {
            ...meta,
            channel: verifyRes.channel,
            gatewayResponse: verifyRes.gatewayResponse,
          },
        },
        update: {
          subscriptionId: subId,
          amount: actualPaidAmount,
          status: 'SUCCESSFUL',
          paidAt: now,
          verifiedAt: now,
          verifiedBy: 'GATEWAY_VERIFIED',
          metadata: {
            ...meta,
            channel: verifyRes.channel,
            gatewayResponse: verifyRes.gatewayResponse,
          },
        },
      }),

      this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'ACTIVE',
          plan: targetTier.toLowerCase(),
          updatedAt: now,
        },
      }),

      this.prisma.auditLog.create({
        data: {
          id: `aud_pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId,
          action: 'SUBSCRIPTION_ONLINE_PAYMENT_VERIFIED',
          resourceType: 'SubscriptionPayment',
          resourceId: reference,
          afterData: {
            reference,
            amount: actualPaidAmount,
            planTier: targetTier,
            billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
            gateway: existingPayment?.provider || 'PAYSTACK',
            status: 'SUCCESSFUL',
          },
        },
      }),
    ]);

    // Update BillingInvoice if exists
    let updatedInvoice = null;
    if (existingPayment?.billingInvoiceId) {
      updatedInvoice = await this.prisma.billingInvoice.update({
        where: { id: existingPayment.billingInvoiceId },
        data: {
          status: 'PAID',
          paidAt: now,
          paymentMethod: existingPayment?.provider || 'PAYSTACK',
        },
      }).catch(() => null);
    }

    return {
      success: true,
      payment: updatedPayment,
      subscription: updatedSub,
      invoice: updatedInvoice,
      message: `Subscription successfully activated on ${targetTier} plan.`,
    };
  }

  /**
   * Webhook: Handles incoming Paystack event with HMAC signature verification,
   * audit logging, and server-side gateway re-verification.
   */
  async handlePaystackWebhook(signature: string, payload: any, rawBody: string | Buffer) {
    const isValid = this.paystackAdapter.verifyWebhookSignature(signature, rawBody);
    if (!isValid) {
      this.logger.warn('Rejected invalid or unsigned Paystack webhook signature.');
      await this.prisma.auditLog.create({
        data: {
          id: `aud_wb_rej_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId: payload?.data?.metadata?.tenantId || 'SYSTEM',
          action: 'WEBHOOK_SIGNATURE_REJECTED',
          resourceType: 'Webhook',
          resourceId: signature ? signature.substring(0, 16) + '...' : 'UNSIGNED',
          afterData: {
            provider: 'PAYSTACK',
            event: payload?.event || 'unknown',
            rejectedAt: new Date().toISOString(),
          },
        },
      }).catch(() => {});
      throw new BadRequestException('Invalid or unsigned Paystack webhook signature');
    }

    this.logger.log(`Received cryptographically valid Paystack webhook: event=${payload?.event}`);

    const tenantId = payload?.data?.metadata?.tenantId;
    const reference = payload?.data?.reference;

    if (tenantId) {
      await this.prisma.auditLog.create({
        data: {
          id: `aud_wb_rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId,
          action: 'WEBHOOK_RECEIVED',
          resourceType: 'Webhook',
          resourceId: reference || payload?.data?.id?.toString() || 'NO_REF',
          afterData: {
            provider: 'PAYSTACK',
            event: payload?.event,
            reference,
            amount: payload?.data?.amount,
            currency: payload?.data?.currency,
            receivedAt: new Date().toISOString(),
          },
        },
      }).catch(() => {});
    }

    if (payload?.event === 'charge.success') {
      if (reference && tenantId) {
        try {
          const verifyResult = await this.verifyOnlinePayment(tenantId, reference);
          this.logger.log(
            `Webhook successfully verified subscription payment for tenant ${tenantId}, ref: ${reference}`,
          );
          return { status: 'success', received: true, ...verifyResult };
        } catch (err: any) {
          this.logger.error(`Webhook payment verification error: ${err?.message}`);
          return { status: 'error', received: true, message: err?.message };
        }
      }
    }

    return { status: 'success', received: true };
  }

  /**
   * Webhook: Handles incoming Flutterwave event with secret hash verification,
   * audit logging, and server-side gateway re-verification.
   */
  async handleFlutterwaveWebhook(signature: string, payload: any) {
    const isValid = this.flutterwaveAdapter.verifyWebhookSignature(signature);
    if (!isValid) {
      this.logger.warn('Rejected invalid or unsigned Flutterwave webhook signature.');
      await this.prisma.auditLog.create({
        data: {
          id: `aud_flw_rej_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId: payload?.data?.meta?.tenantId || payload?.data?.customer?.tenantId || 'SYSTEM',
          action: 'WEBHOOK_SIGNATURE_REJECTED',
          resourceType: 'Webhook',
          resourceId: signature ? signature.substring(0, 16) + '...' : 'UNSIGNED',
          afterData: {
            provider: 'FLUTTERWAVE',
            event: payload?.['event.type'] || payload?.event || 'unknown',
            rejectedAt: new Date().toISOString(),
          },
        },
      }).catch(() => {});
      throw new BadRequestException('Invalid or unsigned Flutterwave webhook signature');
    }

    this.logger.log(`Received cryptographically valid Flutterwave webhook: event=${payload?.event}`);

    const tenantId = payload?.data?.meta?.tenantId || payload?.data?.customer?.tenantId;
    const reference = payload?.data?.tx_ref || payload?.txRef;

    if (tenantId) {
      await this.prisma.auditLog.create({
        data: {
          id: `aud_flw_rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId,
          action: 'WEBHOOK_RECEIVED',
          resourceType: 'Webhook',
          resourceId: reference || 'NO_REF',
          afterData: {
            provider: 'FLUTTERWAVE',
            event: payload?.['event.type'] || payload?.event,
            reference,
            amount: payload?.data?.amount,
            currency: payload?.data?.currency,
            receivedAt: new Date().toISOString(),
          },
        },
      }).catch(() => {});
    }

    if (reference && tenantId) {
      try {
        const verifyResult = await this.verifyOnlinePayment(tenantId, reference);
        return { status: 'success', received: true, ...verifyResult };
      } catch (err: any) {
        this.logger.error(`Flutterwave webhook verification error: ${err?.message}`);
        return { status: 'error', received: true, message: err?.message };
      }
    }

    return { status: 'success', received: true };
  }

  /**
   * Bank Transfer: Initiates bank transfer flow.
   * Generates pending invoice and official platform bank details.
   */
  async initiateBankTransfer(
    tenantId: string,
    userEmail: string,
    dto: InitiateBankTransferDto,
  ) {
    const targetTier = (dto.planTier || 'STANDARD').toUpperCase();
    const cycle = (dto.billingCycle || 'TERMLY').toUpperCase();
    const isAnnual = cycle === 'ANNUAL' || cycle === 'YEARLY';

    let plan = await this.prisma.subscriptionPlan.findUnique({
      where: { tier: targetTier },
    });
    if (!plan) {
      plan = await this.prisma.subscriptionPlan.findFirst();
    }

    const price = isAnnual
      ? Number(plan?.annualPrice || 987000)
      : Number(plan?.termlyPrice || 350000);

    const termlyFull = Number(plan?.termlyPrice || 350000) * 3;
    const discount = isAnnual ? termlyFull - price : 0;
    const now = new Date();
    const invoiceNumber = `SUB-INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const bankReference = `BT-SAAS-${tenantId.substring(0, 8)}-${Date.now()}`;

    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });

    const invoice = await this.prisma.billingInvoice.create({
      data: {
        id: `binv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        subscriptionId: sub?.id || null,
        invoiceNumber,
        amount: price,
        currency: plan?.currency || 'NGN',
        status: 'PENDING',
        dueDate: new Date(now.getTime() + 7 * 86400000),
        paymentMethod: 'BANK_TRANSFER',
        lineItems: [
          {
            description: `${plan?.name || targetTier} Subscription (${isAnnual ? 'ANNUAL (Save 6%)' : 'TERMLY'}) - Bank Transfer`,
            amount: price,
            quantity: 1,
            subtotal: isAnnual ? termlyFull : price,
            discountApplied: discount,
          },
        ],
      },
    });

    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        id: `spay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        subscriptionId: sub?.id || null,
        billingInvoiceId: invoice.id,
        amount: price,
        currency: plan?.currency || 'NGN',
        paymentMethod: 'BANK_TRANSFER',
        provider: 'BANK_TRANSFER',
        providerReference: bankReference,
        status: 'PENDING',
        metadata: {
          planTier: targetTier,
          billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
          invoiceId: invoice.id,
          customerEmail: userEmail,
        },
      },
    });

    return {
      success: true,
      status: 'PENDING_VERIFICATION',
      paymentId: payment.id,
      reference: bankReference,
      amount: price,
      currency: plan?.currency || 'NGN',
      bankDetails: {
        bankName: 'Zenith Bank Plc',
        accountName: 'EduSaaS Multi-Tenant School Platform Ltd',
        accountNumber: '1018899201',
        currency: 'NGN',
      },
      invoice,
      instructions: `Please transfer exactly ₦${price.toLocaleString()} to the platform account and use reference '${bankReference}'. Your subscription will be activated upon Super Admin payment confirmation.`,
    };
  }

  /**
   * Bank Transfer: Tenant submits payment proof (reference, bank, date, receipt).
   */
  async submitBankTransferProof(tenantId: string, dto: SubmitBankTransferProofDto) {
    let payment = await this.prisma.subscriptionPayment.findFirst({
      where: {
        tenantId,
        ...(dto.paymentId ? { id: dto.paymentId } : {}),
        ...(dto.reference ? { providerReference: dto.reference } : {}),
      },
    });

    if (!payment) {
      payment = await this.prisma.subscriptionPayment.findFirst({
        where: {
          tenantId,
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const updatedMetadata = {
      ...((payment?.metadata as any) || {}),
      senderBank: dto.senderBank,
      senderAccountName: dto.senderAccountName,
      transferDate: dto.transferDate,
      proofReference: dto.transactionReference,
      proofUrl: dto.proofUrl,
      notes: dto.notes,
      submittedAt: new Date(),
    };

    if (!payment) {
      const ref = dto.transactionReference || `BT-PROOF-${Date.now()}`;
      const sub = await this.prisma.subscription.findFirst({ where: { tenantId } });
      const createdPayment = await this.prisma.subscriptionPayment.create({
        data: {
          id: `spay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId,
          subscriptionId: sub?.id || null,
          amount: 350000,
          currency: 'NGN',
          paymentMethod: 'BANK_TRANSFER',
          provider: 'BANK_TRANSFER',
          providerReference: ref,
          status: 'PENDING',
          metadata: updatedMetadata,
        },
      });

      return {
        success: true,
        paymentId: createdPayment.id,
        reference: ref,
        status: 'PENDING',
        message: 'Bank transfer proof submitted successfully. Pending Super Admin verification.',
      };
    }

    const updatedPayment = await this.prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        paymentMethod: 'BANK_TRANSFER',
        provider: 'BANK_TRANSFER',
        status: 'PENDING',
        metadata: updatedMetadata,
      },
    });

    return {
      success: true,
      paymentId: updatedPayment.id,
      reference: updatedPayment.providerReference,
      status: 'PENDING',
      message: 'Bank transfer proof submitted successfully. Pending Super Admin verification.',
    };
  }

  /**
   * Super Admin: Manually records and activates payment outside gateway (cash, transfer, cheque).
   * Generates complete audit log and activates subscription.
   */
  async recordManualPaymentBySuperAdmin(
    tenantId: string,
    adminUser: { email?: string; userId?: string },
    dto: RecordManualPaymentDto,
  ) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('Payment amount must be a positive number.');
    }
    if (!dto.reason) {
      throw new BadRequestException('A reason for manual payment assignment is strictly required for audit.');
    }

    const now = new Date();
    const targetTier = (dto.planTier || 'STANDARD').toUpperCase();
    const cycle = (dto.billingCycle || 'TERMLY').toUpperCase();
    const isAnnual = cycle === 'ANNUAL' || cycle === 'YEARLY';
    const durationDays = isAnnual ? 365 : 90;
    const periodEnd = new Date(now.getTime() + durationDays * 86400000);

    let plan = await this.prisma.subscriptionPlan.findUnique({
      where: { tier: targetTier },
    });
    if (!plan) {
      plan = await this.prisma.subscriptionPlan.findFirst();
    }

    // Idempotency & Tenant Ownership: Check if reference already exists
    const existingPayment = await this.prisma.subscriptionPayment.findFirst({
      where: { providerReference: dto.reference },
    });
    if (existingPayment) {
      if (existingPayment.tenantId !== tenantId) {
        throw new ForbiddenException(
          'Payment reference collision: This transaction reference already belongs to a different school organization.',
        );
      }
      if (existingPayment.status === 'SUCCESSFUL') {
        return {
          success: true,
          alreadyRecorded: true,
          payment: existingPayment,
          message: 'Payment with this transaction reference has already been recorded.',
        };
      }
    }

    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });
    const subId = sub?.id || `sub_${tenantId.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : now;
    const paymentId = existingPayment?.id || `spay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const [updatedSub, payment] = await this.prisma.$transaction([
      this.prisma.subscription.upsert({
        where: { id: subId },
        create: {
          id: subId,
          tenantId,
          planId: plan?.id,
          planTier: targetTier,
          status: 'ACTIVE',
          billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
          priceAtPurchase: dto.amount,
          currency: plan?.currency || 'NGN',
          trialEndsAt: null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          maxStudents: plan?.maxStudents || 1500,
          maxCampuses: plan?.maxCampuses || 3,
          maxStaff: plan?.maxStaff || 100,
          storageLimitMb: plan?.storageLimitMb || 25600,
          autoRenew: true,
        },
        update: {
          planId: plan?.id,
          planTier: targetTier,
          status: 'ACTIVE',
          billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
          priceAtPurchase: dto.amount,
          trialEndsAt: null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          maxStudents: plan?.maxStudents,
          maxCampuses: plan?.maxCampuses,
          maxStaff: plan?.maxStaff,
          storageLimitMb: plan?.storageLimitMb,
          updatedAt: now,
        },
      }),

      this.prisma.subscriptionPayment.upsert({
        where: { id: paymentId },
        create: {
          id: paymentId,
          tenantId,
          subscriptionId: subId,
          amount: dto.amount,
          currency: plan?.currency || 'NGN',
          paymentMethod: dto.paymentMethod || 'MANUAL_SUPERADMIN',
          provider: 'MANUAL',
          providerReference: dto.reference,
          status: 'SUCCESSFUL',
          paidAt: paymentDate,
          verifiedAt: now,
          verifiedBy: adminUser.email || 'Super Admin',
          metadata: {
            reason: dto.reason,
            notes: dto.notes,
            recordedBy: adminUser.email,
            planTier: targetTier,
            billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
          },
        },
        update: {
          amount: dto.amount,
          status: 'SUCCESSFUL',
          paidAt: paymentDate,
          verifiedAt: now,
          verifiedBy: adminUser.email || 'Super Admin',
          metadata: {
            reason: dto.reason,
            notes: dto.notes,
            recordedBy: adminUser.email,
            planTier: targetTier,
            billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
          },
        },
      }),

      this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'ACTIVE',
          plan: targetTier.toLowerCase(),
          updatedAt: now,
        },
      }),

      this.prisma.auditLog.create({
        data: {
          id: `aud_man_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenantId,
          actorUserId: adminUser.userId || null,
          action: 'SUBSCRIPTION_MANUAL_PAYMENT_RECORDED',
          resourceType: 'SubscriptionPayment',
          resourceId: paymentId,
          afterData: {
            whoActivated: adminUser.email || 'Platform Super Admin',
            amount: dto.amount,
            plan: targetTier,
            billingPeriod: isAnnual ? 'ANNUAL' : 'TERMLY',
            paymentMethod: dto.paymentMethod,
            reference: dto.reference,
            date: paymentDate,
            reason: dto.reason,
            notes: dto.notes,
          },
        },
      }),
    ]);

    const invoiceNumber = `SUB-INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const invoice = await this.prisma.billingInvoice.create({
      data: {
        id: `binv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        subscriptionId: updatedSub.id,
        invoiceNumber,
        amount: dto.amount,
        currency: plan?.currency || 'NGN',
        status: 'PAID',
        dueDate: now,
        paidAt: paymentDate,
        paymentMethod: dto.paymentMethod,
        lineItems: [
          {
            description: `Manual Payment Assignment: ${plan?.name || targetTier} (${dto.billingCycle}) - ${dto.reason}`,
            amount: dto.amount,
            quantity: 1,
          },
        ],
      },
    });

    return {
      success: true,
      payment,
      subscription: updatedSub,
      invoice,
      message: `Manual payment successfully recorded and subscription activated on ${targetTier}.`,
    };
  }

  /**
   * Official SaaS Subscription Receipt Generator
   */
  async generateSubscriptionReceipt(tenantId: string, paymentId: string, isSuperAdmin: boolean = false) {
    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { id: paymentId },
      include: {
        tenant: true,
        subscription: { include: { plan: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Subscription payment with ID '${paymentId}' not found.`);
    }

    // Tenant Isolation Enforcement
    if (!isSuperAdmin && payment.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied: Cannot access subscription receipts of another school.');
    }

    const tenant = payment.tenant;
    const sub = payment.subscription;
    const plan = sub?.plan;
    const meta = (payment.metadata as any) || {};
    const year = new Date(payment.paidAt || payment.createdAt).getFullYear();

    const isAnnual = (sub?.billingCycle || meta.billingCycle) === 'ANNUAL';
    const subtotal = meta.subtotal ? Number(meta.subtotal) : (isAnnual ? Number(plan?.termlyPrice || 350000) * 3 : Number(payment.amount));
    const discount = meta.discountApplied ? Number(meta.discountApplied) : (isAnnual ? subtotal - Number(payment.amount) : 0);

    return {
      receiptNumber: `REC-SAAS-${year}-${payment.id.substring(payment.id.length - 6).toUpperCase()}`,
      issuedAt: payment.paidAt || payment.createdAt,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      payment: {
        id: payment.id,
        reference: payment.providerReference,
        amount: Number(payment.amount),
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        provider: payment.provider,
        status: payment.status,
        paidAt: payment.paidAt,
        verifiedAt: payment.verifiedAt,
        verifiedBy: payment.verifiedBy,
      },
      subscription: {
        planTier: sub?.planTier || meta.planTier,
        planName: plan?.name || sub?.planTier || meta.planTier,
        billingCycle: sub?.billingCycle || meta.billingCycle,
        periodStart: sub?.currentPeriodStart,
        periodEnd: sub?.currentPeriodEnd,
      },
      breakdown: {
        subtotal,
        discountApplied: discount,
        discountPercentage: isAnnual ? 6 : 0,
        totalPaid: Number(payment.amount),
        currency: payment.currency,
      },
      issuer: {
        organization: 'EduSaaS Multi-Tenant School Management Platform',
        legalEntity: 'EduSaaS Cloud Technologies Ltd',
        taxIdentificationNumber: 'TIN-99201948-001',
        supportEmail: 'billing@edusaas.ng',
        status: payment.status === 'SUCCESSFUL' ? 'PAID' : 'PENDING',
      },
    };
  }

  /**
   * List all subscription payments for a specific tenant.
   */
  async listTenantPayments(tenantId: string) {
    const payments = await this.prisma.subscriptionPayment.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return payments;
  }

  /**
   * List all subscription payments across all tenants for Super Admin.
   */
  async listPlatformPayments() {
    const payments = await this.prisma.subscriptionPayment.findMany({
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        subscription: { select: { id: true, planTier: true, billingCycle: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return payments;
  }
}
