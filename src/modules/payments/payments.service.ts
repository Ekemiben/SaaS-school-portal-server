import { Injectable, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import crypto, { randomUUID } from 'crypto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async listPayments(tenantId: string, studentId?: string) {
    return Array.from(this.prisma.memoryStore.payments.values()).filter(
      (p) => p.tenantId === tenantId && (!studentId || p.studentId === studentId),
    );
  }

  async initializePayment(
    tenantId: string,
    data: {
      invoiceId: string;
      studentId: string;
      amount: number;
      currency?: string;
      provider?: 'PAYSTACK' | 'FLUTTERWAVE' | 'MANUAL';
      callbackUrl?: string;
    },
  ) {
    const invoice = this.prisma.memoryStore.invoices.get(data.invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.balanceAmount <= 0) {
      throw new BadRequestException('This invoice has already been fully paid.');
    }

    const reference = `PAY-${Date.now()}-${randomUUID().substring(0, 8).toUpperCase()}`;
    const id = `pmt_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const payment = {
      id,
      tenantId,
      invoiceId: data.invoiceId,
      studentId: data.studentId,
      reference,
      transactionId: null,
      amount: data.amount,
      currency: data.currency || 'USD',
      provider: data.provider || 'PAYSTACK',
      status: 'PENDING',
      paidAt: null,
      metadata: { callbackUrl: data.callbackUrl },
      idempotencyKey: reference,
      createdAt: new Date(),
    };

    this.prisma.memoryStore.payments.set(id, payment);

    return {
      payment,
      checkoutUrl: `https://checkout.schoolportal.io/pay/${reference}`,
      accessCode: reference,
    };
  }

  async verifyPayment(tenantId: string, reference: string) {
    const payment = Array.from(this.prisma.memoryStore.payments.values()).find(
      (p) => p.tenantId === tenantId && p.reference === reference,
    );

    if (!payment) {
      throw new NotFoundException('Payment reference not found');
    }

    if (payment.status === 'SUCCESSFUL') {
      return { success: true, message: 'Payment already verified and credited.', payment };
    }

    // Process payment success and credit invoice
    payment.status = 'SUCCESSFUL';
    payment.paidAt = new Date();
    payment.transactionId = `TXN_${randomUUID().substring(0, 10).toUpperCase()}`;
    this.prisma.memoryStore.payments.set(payment.id, payment);

    if (payment.invoiceId) {
      const invoice = this.prisma.memoryStore.invoices.get(payment.invoiceId);
      if (invoice) {
        invoice.paidAmount += payment.amount;
        invoice.balanceAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount);
        invoice.status = invoice.balanceAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
        invoice.updatedAt = new Date();
        this.prisma.memoryStore.invoices.set(invoice.id, invoice);
      }
    }

    return {
      success: true,
      message: 'Payment verified and credited to school account successfully!',
      payment,
    };
  }

  async handleWebhook(
    provider: 'paystack' | 'flutterwave',
    payload: any,
    _signature: string,
  ) {
    // Cryptographic signature validation if secret is configured
    if (provider === 'paystack') {
      const secret = this.configService?.get('PAYSTACK_SECRET_KEY') || process.env.PAYSTACK_SECRET_KEY;
      if (secret) {
        if (!_signature) {
          throw new BadRequestException('Missing webhook signature');
        }
        const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(payload)).digest('hex');
        if (hash !== _signature) {
          throw new BadRequestException('Invalid cryptographic webhook signature');
        }
      }
    } else if (provider === 'flutterwave') {
      const secretHash = this.configService?.get('FLUTTERWAVE_SECRET_HASH') || process.env.FLUTTERWAVE_SECRET_HASH;
      if (secretHash) {
        if (!_signature || _signature !== secretHash) {
          throw new BadRequestException('Invalid cryptographic webhook signature');
        }
      }
    }

    // Section 31: Idempotency check on webhook transaction ID / reference
    const reference = payload?.data?.reference || payload?.txRef;
    if (!reference) {
      return { received: true, message: 'No reference in payload' };
    }

    const payment = Array.from(this.prisma.memoryStore.payments.values()).find(
      (p) => p.reference === reference,
    );

    if (!payment) {
      return { received: true, message: 'Reference not recognized' };
    }

    if (payment.status === 'SUCCESSFUL') {
      return { received: true, message: 'Already processed (idempotent)' };
    }

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

    return {
      receiptNumber: `REC-${payment.reference.toUpperCase()}`,
      issuedAt: payment.paidAt || payment.createdAt,
      school: {
        name: tenant?.name || 'School Name',
        slug: tenant?.slug || '',
      },
      student: {
        id: student?.id,
        fullName: student ? `${student.firstName} ${student.lastName}` : 'Student',
        admissionNumber: student?.admissionNumber || 'N/A',
      },
      payment: {
        id: payment.id,
        reference: payment.reference,
        transactionId: payment.transactionId || payment.reference,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.provider,
        status: payment.status,
      },
      invoice: invoice
        ? {
            invoiceNumber: invoice.id,
            totalAmount: invoice.totalAmount,
            paidAmount: invoice.paidAmount,
            remainingBalance: invoice.balanceAmount,
            status: invoice.status,
          }
        : null,
      securityHash: crypto.createHash('sha256').update(`${payment.id}:${payment.amount}:${payment.reference}`).digest('hex'),
    };
  }

  async refundPayment(
    tenantId: string,
    paymentId: string,
    reason: string,
    refundedByUserId: string,
  ) {
    const payment = this.prisma.memoryStore.payments.get(paymentId);
    if (!payment || payment.tenantId !== tenantId) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== 'SUCCESSFUL') {
      throw new BadRequestException('Only successful payments can be refunded');
    }

    payment.status = 'REFUNDED';
    payment.refundedAt = new Date();
    payment.refundReason = reason;
    payment.refundedByUserId = refundedByUserId;
    this.prisma.memoryStore.payments.set(payment.id, payment);

    // Adjust invoice balance if attached
    if (payment.invoiceId) {
      const invoice = this.prisma.memoryStore.invoices.get(payment.invoiceId);
      if (invoice) {
        invoice.paidAmount = Math.max(0, invoice.paidAmount - payment.amount);
        invoice.balanceAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount);
        invoice.status = invoice.paidAmount === 0 ? 'PENDING' : 'PARTIALLY_PAID';
        invoice.updatedAt = new Date();
        this.prisma.memoryStore.invoices.set(invoice.id, invoice);
      }
    }

    return {
      success: true,
      message: 'Payment refunded successfully',
      payment,
    };
  }
}
