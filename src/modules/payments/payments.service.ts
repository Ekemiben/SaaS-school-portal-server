import { Injectable, BadRequestException, NotFoundException, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { CloudflareR2StorageProvider } from '../files/storage.provider.js';
import { QueueService } from '../../jobs/queue.service.js';
import { QUEUES, JOB_TYPES } from '../../jobs/queue.constants.js';
import { OutboxService } from '../../infrastructure/outbox/outbox.service.js';
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
    @Optional() private readonly queueService?: QueueService,
    @Optional() private readonly outboxService?: OutboxService,
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
    if (this.prisma.isDbConnected) {
      try {
        const dbPayments = await this.prisma.payment.findMany({
          where: {
            tenantId,
            ...(studentId ? { studentId } : {}),
          },
          include: {
            student: true,
            invoice: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (dbPayments.length > 0) {
          return dbPayments.map((p: any) => {
            const dateStr =
              typeof p.paidAt === 'string'
                ? p.paidAt
                : (p.paidAt || p.createdAt)?.toISOString?.().split('T')[0] ||
                  new Date().toISOString().split('T')[0];

            return {
              ...p,
              id: p.id,
              student: p.student ? `${p.student.firstName} ${p.student.lastName}` : 'Student',
              studentId: p.student ? p.student.admissionNumber || p.student.id : p.studentId,
              class: 'JSS 1A',
              amount: Number(p.amount || 0),
              gateway: p.provider,
              reference: p.reference,
              date: dateStr,
              status: p.status === 'SUCCESSFUL' ? 'Success' : p.status === 'PENDING' ? 'Pending' : 'Failed',
              invoiceId: p.invoice?.invoiceNumber || p.invoiceId || 'N/A',
              feesCovered: p.invoice?.notes || 'Term Tuition & Levies',
              payerName: (p.metadata as any)?.payerName || 'Parent/Guardian',
              payerEmail: (p.metadata as any)?.payerEmail || 'parent@school.edu.ng',
              channel: p.provider,
            };
          });
        }
      } catch (err: any) {
        this.logger.warn(`Could not query payments from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.payments.values())
      .filter((p: any) => p.tenantId === tenantId && (!studentId || p.studentId === studentId))
      .map((p: any) => {
        const student =
          this.prisma.memoryStore.students.get(p.studentId) ||
          Array.from(this.prisma.memoryStore.students.values()).find(
            (s: any) =>
              s.tenantId === tenantId &&
              (s.admissionNumber === p.studentId || s.id === p.studentId),
          );

        const invoice = p.invoiceId
          ? this.prisma.memoryStore.invoices.get(p.invoiceId) ||
            Array.from(this.prisma.memoryStore.invoices.values()).find(
              (inv: any) =>
                inv.tenantId === tenantId &&
                (inv.invoiceNumber === p.invoiceId || inv.id === p.invoiceId),
            )
          : null;

        const dateStr =
          typeof p.paidAt === 'string'
            ? p.paidAt
            : (p.paidAt || p.createdAt)?.toISOString?.().split('T')[0] ||
              new Date().toISOString().split('T')[0];

        return {
          ...p,
          id: p.id,
          student:
            p.studentName ||
            (student ? `${student.firstName} ${student.lastName}` : 'Student'),
          studentId: student ? student.admissionNumber || student.id : p.studentId || 'STD-001',
          class: student?.currentClass || 'JSS 1A',
          amount: Number(p.amount || 0),
          gateway: p.provider || p.channel || 'Direct Bank Transfer',
          reference: p.reference || p.id,
          date: dateStr,
          status:
            p.status === 'SUCCESSFUL' || p.status === 'Success'
              ? 'Success'
              : p.status === 'PENDING'
              ? 'Pending'
              : 'Failed',
          invoiceId: invoice?.invoiceNumber || p.invoiceId || 'N/A',
          feesCovered: invoice?.notes || p.notes || 'Term Tuition & Levies',
          payerName:
            p.payerName || (student?.guardians?.[0]?.name) || 'Parent/Guardian',
          payerEmail: p.payerEmail || 'parent@school.edu.ng',
          channel: p.channel || p.provider || 'Direct Card / Transfer',
        };
      });
  }

  private mapPaymentProvider(providerStr?: string): 'PAYSTACK' | 'FLUTTERWAVE' | 'MANUAL' | 'BANK_TRANSFER' {
    if (!providerStr) return 'MANUAL';
    const upper = String(providerStr).toUpperCase();
    if (upper.includes('PAYSTACK')) return 'PAYSTACK';
    if (upper.includes('FLUTTERWAVE')) return 'FLUTTERWAVE';
    if (upper.includes('BANK')) return 'BANK_TRANSFER';
    return 'MANUAL';
  }

  async recordOfflinePayment(tenantId: string, data: any) {
    const id = `pmt_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const reference =
      data.reference || `PAY-${Date.now()}-${randomUUID().substring(0, 6).toUpperCase()}`;

    let invoice: any = null;
    if (data.invoiceId) {
      invoice = this.prisma.memoryStore.invoices.get(data.invoiceId);
      if (!invoice) {
        invoice = Array.from(this.prisma.memoryStore.invoices.values()).find(
          (inv: any) =>
            inv.tenantId === tenantId &&
            (inv.invoiceNumber === data.invoiceId || inv.id === data.invoiceId),
        );
      }
    }

    const studentId = data.studentId || invoice?.studentId;
    let student: any = null;
    if (studentId) {
      student =
        this.prisma.memoryStore.students.get(studentId) ||
        Array.from(this.prisma.memoryStore.students.values()).find(
          (s: any) =>
            s.tenantId === tenantId && (s.admissionNumber === studentId || s.id === studentId),
        );
    }

    const amount = Number(data.amount || 0);

    const payment: any = {
      id,
      tenantId,
      invoiceId: invoice?.id || data.invoiceId || null,
      studentId: student?.id || studentId || 'std_adhoc',
      studentName:
        data.student || (student ? `${student.firstName} ${student.lastName}` : 'Student'),
      reference,
      transactionId: `TXN_${randomUUID().substring(0, 8).toUpperCase()}`,
      amount,
      currency: data.currency || invoice?.currency || 'NGN',
      provider: data.gateway || data.channel || 'Direct Bank Transfer',
      channel: data.channel || data.gateway || 'NIBSS Instant Payment',
      status: 'SUCCESSFUL',
      paidAt: new Date(data.date || Date.now()),
      payerName: data.payerName || (student?.guardians?.[0]?.name) || 'Parent/Guardian',
      payerEmail: data.payerEmail || 'parent@school.edu.ng',
      notes: data.note || data.notes || data.feesCovered || 'Fee payment',
      createdAt: new Date(),
    };

    if (this.prisma.isDbConnected) {
      try {
        let dbStudent: any = null;
        if (studentId) {
          dbStudent = await this.prisma.student.findFirst({
            where: {
              tenantId,
              OR: [{ id: studentId }, { admissionNumber: studentId }],
            },
          });
        }

        // If student does not exist in DB yet, materialize student in PostgreSQL to satisfy FK
        if (!dbStudent) {
          let campus = await this.prisma.campus.findFirst({ where: { tenantId } });
          if (!campus) {
            campus = await this.prisma.campus.create({
              data: {
                tenantId,
                name: 'Main Campus',
                code: 'MAIN',
                isMain: true,
                address: 'Main Campus Address',
              },
            });
          }

          const nameParts = (data.student || (student ? `${student.firstName} ${student.lastName}` : 'Student User')).trim().split(/\s+/);
          const firstName = student?.firstName || nameParts[0] || 'Student';
          const lastName = student?.lastName || nameParts.slice(1).join(' ') || 'User';
          const admNo = student?.admissionNumber || (typeof studentId === 'string' && !studentId.startsWith('std_adhoc') ? studentId : `ADM-${Date.now().toString().slice(-6)}`);

          dbStudent = await this.prisma.student.create({
            data: {
              id: student?.id && student.id.length > 20 ? student.id : `std_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
              tenantId,
              campusId: campus.id,
              admissionNumber: admNo,
              firstName,
              lastName,
              gender: student?.gender || 'OTHER',
              status: 'ACTIVE',
            },
          });
        }

        let dbInvoice: any = null;
        if (data.invoiceId) {
          dbInvoice = await this.prisma.invoice.findFirst({
            where: {
              tenantId,
              OR: [{ id: data.invoiceId }, { invoiceNumber: data.invoiceId }],
            },
          });

          // Materialize invoice in DB if it was only in memoryStore
          if (!dbInvoice && dbStudent) {
            const invNumber = invoice?.invoiceNumber || (typeof data.invoiceId === 'string' ? data.invoiceId : `INV-${Date.now().toString().slice(-6)}`);
            const invTotal = Number(invoice?.totalAmount || amount);
            const invPaid = Number(invoice?.paidAmount || 0);
            const invBalance = Math.max(0, Number((invTotal - invPaid).toFixed(2)));

            dbInvoice = await this.prisma.invoice.create({
              data: {
                id: invoice?.id && invoice.id.length > 20 ? invoice.id : `inv_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
                tenantId,
                studentId: dbStudent.id,
                invoiceNumber: invNumber,
                totalAmount: invTotal,
                paidAmount: invPaid,
                balanceAmount: invBalance,
                currency: payment.currency,
                dueDate: invoice?.dueDate ? new Date(invoice.dueDate) : new Date(Date.now() + 30 * 86400000),
                status: 'PENDING',
                notes: invoice?.notes || data.feesCovered || 'Tuition Fees',
              },
            });
          }
        }

        if (dbStudent) {
          await this.prisma.$transaction(async (tx) => {
            await tx.payment.create({
              data: {
                id,
                tenantId,
                invoiceId: dbInvoice?.id || null,
                studentId: dbStudent.id,
                reference,
                transactionId: payment.transactionId,
                amount,
                currency: payment.currency,
                provider: this.mapPaymentProvider(payment.provider),
                status: 'SUCCESSFUL',
                paidAt: payment.paidAt,
                metadata: {
                  payerName: payment.payerName,
                  payerEmail: payment.payerEmail,
                  notes: payment.notes,
                },
              },
            });

            if (dbInvoice) {
              const newPaidAmount = Number(((dbInvoice.paidAmount || 0) + amount).toFixed(2));
              const newBalance = Math.max(0, Number(((dbInvoice.totalAmount || 0) - newPaidAmount).toFixed(2)));
              const newStatus = newBalance === 0 ? 'PAID' : 'PARTIALLY_PAID';

              await tx.invoice.update({
                where: { id: dbInvoice.id },
                data: {
                  paidAmount: newPaidAmount,
                  balanceAmount: newBalance,
                  status: newStatus,
                  paidAt: newBalance === 0 ? new Date() : undefined,
                  updatedAt: new Date(),
                },
              });
            }

            if (this.outboxService) {
              await this.outboxService.recordEvent(
                tenantId,
                'PAYMENT_RECORDED',
                {
                  paymentId: id,
                  reference,
                  amount,
                  invoiceId: dbInvoice?.id,
                  studentId: dbStudent.id,
                  paidAt: payment.paidAt.toISOString(),
                },
                tx,
              );
            }
          });
        }
      } catch (err: any) {
        this.logger.warn(`Could not persist offline payment in DB: ${err.message}`);
      }
    }

    this.prisma.memoryStore.payments.set(id, payment);

    if (invoice) {
      invoice.paidAmount = Number(((invoice.paidAmount || 0) + amount).toFixed(2));
      invoice.balanceAmount = Math.max(
        0,
        Number(((invoice.totalAmount || 0) - invoice.paidAmount).toFixed(2)),
      );
      invoice.status = invoice.balanceAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
      invoice.updatedAt = new Date();
      this.prisma.memoryStore.invoices.set(invoice.id, invoice);
    }

    return {
      success: true,
      message: 'Payment recorded and invoice credited successfully.',
      payment: {
        ...payment,
        id: payment.id,
        student: payment.studentName,
        class: data.class || student?.currentClass || 'JSS 1A',
        gateway: payment.provider,
        date: payment.paidAt.toISOString().split('T')[0],
        status: 'Success',
      },
    };
  }

  async initializePayment(tenantId: string, dto: InitializePaymentDto) {
    let invoice: any = null;
    let student: any = null;

    if (this.prisma.isDbConnected) {
      try {
        invoice = await this.prisma.invoice.findFirst({
          where: {
            tenantId,
            OR: [{ id: dto.invoiceId }, { invoiceNumber: dto.invoiceId }],
          },
          include: { student: true },
        });
        if (invoice) {
          student = invoice.student;
        }
      } catch (err: any) {
        this.logger.warn(`Could not query invoice from DB: ${err.message}`);
      }
    }

    if (!invoice) {
      invoice = this.prisma.memoryStore.invoices.get(dto.invoiceId);
      if (!invoice) {
        invoice = Array.from(this.prisma.memoryStore.invoices.values()).find(
          (inv: any) =>
            inv.tenantId === tenantId &&
            (inv.invoiceNumber === dto.invoiceId || inv.id === dto.invoiceId),
        );
      }
    }

    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.balanceAmount <= 0) {
      throw new BadRequestException('This invoice has already been fully paid.');
    }

    if (!student) {
      student =
        this.prisma.memoryStore.students.get(dto.studentId) ||
        Array.from(this.prisma.memoryStore.students.values()).find(
          (s: any) =>
            s.tenantId === tenantId &&
            (s.admissionNumber === dto.studentId || s.id === dto.studentId),
        );
    }

    const config = await this.getGatewayConfig(tenantId);
    const provider = dto.provider || config.defaultProvider || PaymentGatewayProvider.PAYSTACK;
    const reference = `PAY-${Date.now()}-${randomUUID().substring(0, 8).toUpperCase()}`;
    const id = `pmt_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const payment: any = {
      id,
      tenantId,
      invoiceId: invoice.id || dto.invoiceId,
      studentId: student?.id || dto.studentId,
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

    if (this.prisma.isDbConnected && student?.id) {
      try {
        await this.prisma.payment.create({
          data: {
            id,
            tenantId,
            invoiceId: invoice.id || null,
            studentId: student.id,
            reference,
            amount: dto.amount,
            currency: payment.currency,
            provider: this.mapPaymentProvider(provider),
            status: 'PENDING',
            metadata: payment.metadata,
            idempotencyKey: reference,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not persist pending payment in DB: ${err.message}`);
      }
    }

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
    let payment: any = null;
    let dbInvoice: any = null;
    let dbStudent: any = null;

    if (this.prisma.isDbConnected) {
      try {
        payment = await this.prisma.payment.findFirst({
          where: { tenantId, reference },
          include: { invoice: true, student: true },
        });
        if (payment) {
          dbInvoice = payment.invoice;
          dbStudent = payment.student;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to check payment in DB: ${err.message}`);
      }
    }

    if (!payment) {
      payment = Array.from(this.prisma.memoryStore.payments.values()).find(
        (p: any) => p.tenantId === tenantId && p.reference === reference,
      );
    }

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
      if (this.prisma.isDbConnected && payment.id) {
        await this.prisma.payment.updateMany({
          where: { tenantId, reference },
          data: { status: 'FAILED' },
        }).catch(() => {});
      }
      payment.status = 'FAILED';
      this.prisma.memoryStore.payments.set(payment.id, payment);
      throw new BadRequestException('Payment gateway verification failed or uncompleted.');
    }

    const paidAt = verification.paidAt ? new Date(verification.paidAt) : new Date();
    const transactionId = (verification as any).transactionId || (verification.rawPayload as any)?.id || (verification.rawPayload as any)?.transaction_id || `TXN_${randomUUID().substring(0, 10).toUpperCase()}`;
    const channel = verification.channel || payment.channel;

    // Execute atomic update in PostgreSQL if DB is connected
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.updateMany({
            where: { tenantId, reference },
            data: {
              status: 'SUCCESSFUL',
              paidAt,
              transactionId,
            },
          });

          if (payment.invoiceId) {
            const inv = await tx.invoice.findFirst({
              where: { id: payment.invoiceId },
            });
            if (inv) {
              const newPaidAmount = Number(((inv.paidAmount || 0) + Number(payment.amount)).toFixed(2));
              const newBalance = Math.max(0, Number(((inv.totalAmount || 0) - newPaidAmount).toFixed(2)));
              const newStatus = newBalance === 0 ? 'PAID' : 'PARTIALLY_PAID';

              await tx.invoice.update({
                where: { id: inv.id },
                data: {
                  paidAmount: newPaidAmount,
                  balanceAmount: newBalance,
                  status: newStatus,
                  paidAt: newBalance === 0 ? new Date() : undefined,
                  updatedAt: new Date(),
                },
              });
            }
          }

          if (this.outboxService) {
            await this.outboxService.recordEvent(
              tenantId,
              'PAYMENT_VERIFIED',
              {
                paymentId: payment.id,
                reference: payment.reference,
                amount: payment.amount,
                currency: payment.currency,
                invoiceId: payment.invoiceId,
                channel,
                verifiedAt: paidAt.toISOString(),
              },
              tx,
            );
          }
        });
      } catch (err: any) {
        this.logger.warn(`Could not update payment in DB transaction: ${err.message}`);
      }
    }

    // Dual-mode memoryStore sync
    payment.status = 'SUCCESSFUL';
    payment.paidAt = paidAt;
    payment.transactionId = transactionId;
    payment.channel = channel;
    this.prisma.memoryStore.payments.set(payment.id, payment);

    if (payment.invoiceId) {
      const invoice = this.prisma.memoryStore.invoices.get(payment.invoiceId);
      if (invoice) {
        invoice.paidAmount = Number((invoice.paidAmount + Number(payment.amount)).toFixed(2));
        invoice.balanceAmount = Math.max(0, Number((invoice.totalAmount - invoice.paidAmount).toFixed(2)));
        invoice.status = invoice.balanceAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
        invoice.updatedAt = new Date();
        this.prisma.memoryStore.invoices.set(invoice.id, invoice);
      }
    }

    // Queue parent receipt notification
    if (this.queueService) {
      await this.queueService.dispatch(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
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

    let payment: any = null;
    if (this.prisma.isDbConnected) {
      try {
        payment = await this.prisma.payment.findFirst({ where: { reference } });
      } catch (err: any) {
        this.logger.warn(`DB webhook payment lookup failed: ${err.message}`);
      }
    }
    if (!payment) {
      payment = Array.from(this.prisma.memoryStore.payments.values()).find(
        (p: any) => p.reference === reference,
      );
    }

    if (!payment) return { received: true, message: 'Payment reference unrecognized' };
    if (payment.status === 'SUCCESSFUL') return { received: true, message: 'Idempotent: Already processed' };

    return this.verifyPayment(payment.tenantId, reference);
  }

  async getReceipt(tenantId: string, paymentId: string) {
    let payment: any = null;
    let student: any = null;
    let invoice: any = null;
    let tenant: any = null;

    if (this.prisma.isDbConnected) {
      try {
        payment = await this.prisma.payment.findFirst({
          where: {
            tenantId,
            OR: [{ id: paymentId }, { reference: paymentId }],
          },
          include: {
            student: true,
            invoice: true,
            tenant: true,
          },
        });
        if (payment) {
          student = payment.student;
          invoice = payment.invoice;
          tenant = payment.tenant;
        }
      } catch (err: any) {
        this.logger.warn(`Could not query receipt from DB: ${err.message}`);
      }
    }

    if (!payment) {
      payment = this.prisma.memoryStore.payments.get(paymentId);
      if (!payment || payment.tenantId !== tenantId) {
        throw new NotFoundException('Payment record not found');
      }
      student = this.prisma.memoryStore.students.get(payment.studentId);
      invoice = payment.invoiceId ? this.prisma.memoryStore.invoices.get(payment.invoiceId) : null;
      tenant = this.prisma.memoryStore.tenants.get(tenantId);
    }

    const securityHash = crypto
      .createHash('sha256')
      .update(`${payment.id}:${payment.amount}:${payment.reference}`)
      .digest('hex');

    return {
      receiptNumber: `REC-${(payment.reference || payment.id).toUpperCase()}`,
      issuedAt: payment.paidAt || payment.createdAt,
      school: { name: tenant?.name || 'School Name', slug: tenant?.slug || '' },
      student: {
        id: student?.id,
        fullName: student ? `${student.firstName} ${student.lastName}` : (payment.studentName || 'Student'),
        admissionNumber: student?.admissionNumber || 'N/A',
      },
      payment: {
        id: payment.id,
        reference: payment.reference,
        transactionId: payment.transactionId || payment.reference,
        amount: Number(payment.amount || 0),
        currency: payment.currency,
        paymentMethod: payment.provider,
        status: payment.status,
      },
      invoice: invoice
        ? {
            invoiceNumber: invoice.invoiceNumber || invoice.id,
            totalAmount: Number(invoice.totalAmount || 0),
            paidAmount: Number(invoice.paidAmount || 0),
            remainingBalance: Number(invoice.balanceAmount || 0),
            status: invoice.status,
          }
        : null,
      securityHash,
    };
  }

  async getReceiptDownload(tenantId: string, paymentId: string) {
    const receiptData = await this.getReceipt(tenantId, paymentId);
    const storageKey = `tenants/${tenantId}/receipts/${receiptData.receiptNumber}.html`;
    return this.storageProvider.generatePresignedDownload(storageKey, `${receiptData.receiptNumber}.html`);
  }

  async refundPayment(tenantId: string, paymentId: string, reason: string, refundedByUserId: string) {
    let payment: any = null;
    let invoice: any = null;

    if (this.prisma.isDbConnected) {
      try {
        payment = await this.prisma.payment.findFirst({
          where: { tenantId, id: paymentId },
          include: { invoice: true },
        });
        if (payment) {
          invoice = payment.invoice;
        }
      } catch (err: any) {
        this.logger.warn(`Could not query payment for refund from DB: ${err.message}`);
      }
    }

    if (!payment) {
      payment = this.prisma.memoryStore.payments.get(paymentId);
      if (payment?.invoiceId) {
        invoice = this.prisma.memoryStore.invoices.get(payment.invoiceId);
      }
    }

    if (!payment || payment.tenantId !== tenantId) throw new NotFoundException('Payment not found');
    if (payment.status !== 'SUCCESSFUL') throw new BadRequestException('Only successful payments can be refunded');

    const refundDate = new Date();

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'REFUNDED',
            },
          });

          if (payment.invoiceId) {
            const inv = await tx.invoice.findFirst({ where: { id: payment.invoiceId } });
            if (inv) {
              const newPaidAmount = Math.max(0, Number(((inv.paidAmount || 0) - Number(payment.amount)).toFixed(2)));
              const newBalance = Math.max(0, Number(((inv.totalAmount || 0) - newPaidAmount).toFixed(2)));
              const newStatus = newPaidAmount === 0 ? 'PENDING' : 'PARTIALLY_PAID';

              await tx.invoice.update({
                where: { id: inv.id },
                data: {
                  paidAmount: newPaidAmount,
                  balanceAmount: newBalance,
                  status: newStatus,
                  updatedAt: new Date(),
                },
              });
            }
          }

          if (this.outboxService) {
            await this.outboxService.recordEvent(
              tenantId,
              'PAYMENT_REFUNDED',
              {
                paymentId: payment.id,
                reference: payment.reference,
                amount: payment.amount,
                reason,
                refundedByUserId,
                refundedAt: refundDate.toISOString(),
              },
              tx,
            );
          }
        });
      } catch (err: any) {
        this.logger.warn(`Could not persist refund in DB: ${err.message}`);
      }
    }

    payment.status = 'REFUNDED';
    payment.refundedAt = refundDate;
    payment.refundReason = reason;
    payment.refundedByUserId = refundedByUserId;
    this.prisma.memoryStore.payments.set(payment.id, payment);

    if (payment.invoiceId) {
      const memInvoice = this.prisma.memoryStore.invoices.get(payment.invoiceId);
      if (memInvoice) {
        memInvoice.paidAmount = Math.max(0, Number((memInvoice.paidAmount - payment.amount).toFixed(2)));
        memInvoice.balanceAmount = Math.max(0, Number((memInvoice.totalAmount - memInvoice.paidAmount).toFixed(2)));
        memInvoice.status = memInvoice.paidAmount === 0 ? 'PENDING' : 'PARTIALLY_PAID';
        memInvoice.updatedAt = new Date();
        this.prisma.memoryStore.invoices.set(memInvoice.id, memInvoice);
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
