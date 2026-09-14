import { Injectable, BadRequestException, NotFoundException, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { CloudflareR2StorageProvider } from '../files/storage.provider.js';
import { BullmqService } from '../../jobs/bullmq.service.js';
import { QUEUES, JOB_TYPES } from '../../jobs/queue.constants.js';
import { PaystackPaymentAdapter } from './adapters/paystack.adapter.js';
import { FlutterwavePaymentAdapter } from './adapters/flutterwave.adapter.js';
import {
  InitializePaymentDto,
  CreateVirtualAccountDto,
  TenantPaymentConfigDto,
  PaymentGatewayProvider,
} from './dto/payment.dto.js';
import { ReceiptRenderer } from './renderer/receipt-renderer.js';
import crypto, { randomUUID } from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly tenantConfigs = new Map<string, TenantPaymentConfigDto>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackAdapter: PaystackPaymentAdapter,
    private readonly flutterwaveAdapter: FlutterwavePaymentAdapter,
    private readonly storageProvider: CloudflareR2StorageProvider,
    @Optional() private readonly bullmqService?: BullmqService,
  ) {}

  async getGatewayConfig(tenantId: string): Promise<TenantPaymentConfigDto> {
    return (
      this.tenantConfigs.get(tenantId) || {
        defaultProvider: PaymentGatewayProvider.PAYSTACK,
        enableCardPayments: true,
        enableVirtualAccounts: true,
        splitPercentage: 100,
      }
    );
  }

  async updateGatewayConfig(tenantId: string, config: TenantPaymentConfigDto) {
    this.tenantConfigs.set(tenantId, config);
    return config;
  }

  async listPayments(tenantId: string, studentId?: string) {
    return Array.from(this.prisma.memoryStore.payments.values()).filter(
      (p: any) => p.tenantId === tenantId && (!studentId || p.studentId === studentId),
    );
  }

  async initializePayment(tenantId: string, dto: InitializePaymentDto) {
    const invoice = this.prisma.memoryStore.invoices.get(dto.invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.balanceAmount <= 0) {
      throw new BadRequestException('This invoice has already been fully paid.');
    }

    const config = await this.getGatewayConfig(tenantId);
    const provider = dto.provider || config.defaultProvider || PaymentGatewayProvider.PAYSTACK;
    const reference = `PAY-${Date.now()}-${randomUUID().substring(0, 8).toUpperCase()}`;
    const id = `pmt_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const student = this.prisma.memoryStore.students.get(dto.studentId);

    const payment: any = {
      id,
      tenantId,
      invoiceId: dto.invoiceId,
      studentId: dto.studentId,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      reference,
      transactionId: null,
      amount: dto.amount,
      currency: dto.currency || invoice.currency || 'NGN',
      provider,
      channel: dto.channel || 'CARD',
      status: 'PENDING',
      paidAt: null,
      subaccountCode: dto.subaccountCode || config.subaccountCode,
      metadata: { callbackUrl: dto.callbackUrl, invoiceNumber: invoice.invoiceNumber },
      idempotencyKey: reference,
      createdAt: new Date(),
    };

    this.prisma.memoryStore.payments.set(id, payment);

    const email = dto.customerEmail || 'parent@schoolportal.ng';
    const initParams = {
      amount: dto.amount,
      currency: payment.currency,
      customerEmail: email,
      reference,
      callbackUrl: dto.callbackUrl,
      metadata: { invoiceId: dto.invoiceId, tenantId, subaccountCode: payment.subaccountCode },
    };

    const initResult =
      provider === PaymentGatewayProvider.FLUTTERWAVE
        ? await this.flutterwaveAdapter.initializePayment(initParams)
        : await this.paystackAdapter.initializePayment(initParams);

    return {
      payment,
      checkoutUrl: initResult.authorizationUrl,
      accessCode: initResult.accessCode || reference,
      reference,
    };
  }

  async createVirtualAccount(tenantId: string, dto: CreateVirtualAccountDto) {
    const invoice = this.prisma.memoryStore.invoices.get(dto.invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found');
    }

    const reference = `DVA-${Date.now()}-${randomUUID().substring(0, 6).toUpperCase()}`;
    const provider = dto.provider || PaymentGatewayProvider.PAYSTACK;

    const dvaResult =
      provider === PaymentGatewayProvider.FLUTTERWAVE
        ? await this.flutterwaveAdapter.createDedicatedVirtualAccount({
            customerEmail: dto.customerEmail,
            customerName: dto.customerName,
            reference,
            bvn: dto.bvn,
          })
        : await this.paystackAdapter.createDedicatedVirtualAccount({
            customerEmail: dto.customerEmail,
            customerName: dto.customerName,
            reference,
            bvn: dto.bvn,
            bankCode: dto.bankCode,
          });

    return {
      ...dvaResult,
      invoiceId: dto.invoiceId,
      studentId: dto.studentId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async verifyPayment(tenantId: string, reference: string) {
    const payment = Array.from(this.prisma.memoryStore.payments.values()).find(
      (p: any) => p.tenantId === tenantId && p.reference === reference,
    );
    if (!payment) {
      throw new NotFoundException('Payment reference not found');
    }
    if (payment.status === 'SUCCESSFUL') {
      return { success: true, message: 'Payment already verified and credited.', payment };
    }

    const adapter =
      payment.provider === PaymentGatewayProvider.FLUTTERWAVE
        ? this.flutterwaveAdapter
        : this.paystackAdapter;

    const verification = await adapter.verifyPayment(reference);
    if (!verification.success || verification.status !== 'successful') {
      payment.status = 'FAILED';
      this.prisma.memoryStore.payments.set(payment.id, payment);
      throw new BadRequestException('Payment gateway verification failed or uncompleted.');
    }

    // Process real-time ledger crediting
    payment.status = 'SUCCESSFUL';
    payment.paidAt = verification.paidAt || new Date();
    payment.transactionId = `TXN_${randomUUID().substring(0, 10).toUpperCase()}`;
    payment.channel = verification.channel || payment.channel;
    this.prisma.memoryStore.payments.set(payment.id, payment);

    if (payment.invoiceId) {
      const invoice = this.prisma.memoryStore.invoices.get(payment.invoiceId);
      if (invoice) {
        invoice.paidAmount = Number((invoice.paidAmount + payment.amount).toFixed(2));
        invoice.balanceAmount = Math.max(0, Number((invoice.totalAmount - invoice.paidAmount).toFixed(2)));
        invoice.status = invoice.balanceAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
        invoice.updatedAt = new Date();
        this.prisma.memoryStore.invoices.set(invoice.id, invoice);
      }
    }

    // Queue parent receipt notification
    if (this.bullmqService) {
      await this.bullmqService.dispatch(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
        tenantId,
        data: {
          title: `Payment Receipt: ${payment.reference}`,
          message: `Payment of ${payment.currency} ${payment.amount} received successfully.`,
          paymentId: payment.id,
        },
      });
    }

    return { success: true, message: 'Payment verified and credited successfully!', payment };
  }

  async handleWebhook(provider: 'paystack' | 'flutterwave', payload: any, signature: string) {
    const adapter = provider === 'flutterwave' ? this.flutterwaveAdapter : this.paystackAdapter;
    const isValid = adapter.verifyWebhookSignature(signature, JSON.stringify(payload));
    if (!isValid) {
      throw new BadRequestException('Invalid cryptographic webhook signature');
    }

    const reference = payload?.data?.reference || payload?.txRef || payload?.data?.tx_ref;
    if (!reference) return { received: true, message: 'No reference in payload' };

    const payment = Array.from(this.prisma.memoryStore.payments.values()).find(
      (p: any) => p.reference === reference,
    );
    if (!payment) return { received: true, message: 'Payment reference unrecognized' };
    if (payment.status === 'SUCCESSFUL') return { received: true, message: 'Idempotent: Already processed' };

    return this.verifyPayment(payment.tenantId, reference);
  }

  async getReceipt(tenantId: string, paymentId: string) {
    const payment = this.prisma.memoryStore.payments.get(paymentId);
    if (!payment || payment.tenantId !== tenantId) {
      throw new NotFoundException('Payment record not found');
    }

    const student = this.prisma.memoryStore.students.get(payment.studentId);
    const invoice = payment.invoiceId ? this.prisma.memoryStore.invoices.get(payment.invoiceId) : null;
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    const securityHash = crypto.createHash('sha256').update(`${payment.id}:${payment.amount}:${payment.reference}`).digest('hex');

    return {
      receiptNumber: `REC-${payment.reference.toUpperCase()}`,
      issuedAt: payment.paidAt || payment.createdAt,
      school: { name: tenant?.name || 'School Name', slug: tenant?.slug || '' },
      student: { id: student?.id, fullName: student ? `${student.firstName} ${student.lastName}` : 'Student', admissionNumber: student?.admissionNumber || 'N/A' },
      payment: { id: payment.id, reference: payment.reference, transactionId: payment.transactionId || payment.reference, amount: payment.amount, currency: payment.currency, paymentMethod: payment.provider, status: payment.status },
      invoice: invoice ? { invoiceNumber: invoice.invoiceNumber || invoice.id, totalAmount: invoice.totalAmount, paidAmount: invoice.paidAmount, remainingBalance: invoice.balanceAmount, status: invoice.status } : null,
      securityHash,
    };
  }

  async getReceiptDownload(tenantId: string, paymentId: string) {
    const receiptData = await this.getReceipt(tenantId, paymentId);
    const storageKey = `tenants/${tenantId}/receipts/${receiptData.receiptNumber}.html`;
    return this.storageProvider.generatePresignedDownload(storageKey, `${receiptData.receiptNumber}.html`);
  }

  async refundPayment(tenantId: string, paymentId: string, reason: string, refundedByUserId: string) {
    const payment = this.prisma.memoryStore.payments.get(paymentId);
    if (!payment || payment.tenantId !== tenantId) throw new NotFoundException('Payment not found');
    if (payment.status !== 'SUCCESSFUL') throw new BadRequestException('Only successful payments can be refunded');

    payment.status = 'REFUNDED';
    payment.refundedAt = new Date();
    payment.refundReason = reason;
    payment.refundedByUserId = refundedByUserId;
    this.prisma.memoryStore.payments.set(payment.id, payment);

    if (payment.invoiceId) {
      const invoice = this.prisma.memoryStore.invoices.get(payment.invoiceId);
      if (invoice) {
        invoice.paidAmount = Math.max(0, Number((invoice.paidAmount - payment.amount).toFixed(2)));
        invoice.balanceAmount = Math.max(0, Number((invoice.totalAmount - invoice.paidAmount).toFixed(2)));
        invoice.status = invoice.paidAmount === 0 ? 'PENDING' : 'PARTIALLY_PAID';
        invoice.updatedAt = new Date();
        this.prisma.memoryStore.invoices.set(invoice.id, invoice);
      }
    }

    return { success: true, message: 'Payment refunded successfully', payment };
  }

  async reconcilePendingPayments(tenantId: string) {
    const pendings = Array.from(this.prisma.memoryStore.payments.values()).filter(
      (p: any) => p.tenantId === tenantId && p.status === 'PENDING',
    );
    let reconciledCount = 0;
    for (const p of pendings) {
      try {
        await this.verifyPayment(tenantId, p.reference);
        reconciledCount++;
      } catch {
        // Leave pending if still unconfirmed
      }
    }
    return { tenantId, totalPendingChecked: pendings.length, reconciledCount, timestamp: new Date().toISOString() };
  }
}
