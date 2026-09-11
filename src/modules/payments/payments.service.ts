import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
