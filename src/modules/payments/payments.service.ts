import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger, Optional } from '@nestjs/common';
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
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { features: true, name: true, currency: true },
    });
    const paymentConfig = (tenant?.features as any)?.paymentConfig;
    if (paymentConfig) {
      return {
        defaultProvider: paymentConfig.defaultProvider || PaymentGatewayProvider.PAYSTACK,
        environment: paymentConfig.environment || 'LIVE',
        paystackPublicKey: paymentConfig.paystackPublicKey || '',
        paystackSecretKey: paymentConfig.paystackSecretKey || '',
        flutterwavePublicKey: paymentConfig.flutterwavePublicKey || '',
        flutterwaveSecretKey: paymentConfig.flutterwaveSecretKey || '',
        webhookSecret: paymentConfig.webhookSecret || '',
        subaccountCode: paymentConfig.subaccountCode || '',
        splitPercentage: paymentConfig.splitPercentage ?? 100,
        bearer: paymentConfig.bearer || 'account',
        enableVirtualAccounts: paymentConfig.enableVirtualAccounts ?? true,
        enableCardPayments: paymentConfig.enableCardPayments ?? true,
        enableBankTransfer: paymentConfig.enableBankTransfer ?? true,
        autoReconcile: paymentConfig.autoReconcile ?? true,
        bankName: paymentConfig.bankName || '',
        accountNumber: paymentConfig.accountNumber || '',
        accountName: paymentConfig.accountName || '',
        paymentInstructions: paymentConfig.paymentInstructions || '',
      };
    }

    return (
      this.tenantConfigs.get(tenantId) || {
        defaultProvider: PaymentGatewayProvider.PAYSTACK,
        environment: 'LIVE',
        paystackPublicKey: '',
        paystackSecretKey: '',
        flutterwavePublicKey: '',
        flutterwaveSecretKey: '',
        webhookSecret: '',
        subaccountCode: '',
        enableCardPayments: true,
        enableVirtualAccounts: true,
        enableBankTransfer: true,
        autoReconcile: true,
        splitPercentage: 100,
        bearer: 'account',
        bankName: '',
        accountNumber: '',
        accountName: '',
        paymentInstructions: '',
      }
    );
  }

  async updateGatewayConfig(tenantId: string, config: TenantPaymentConfigDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { features: true },
    });
    const existingFeatures = (tenant?.features as any) || {};
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        features: {
          ...existingFeatures,
          paymentConfig: config,
        },
      },
    });
    this.tenantConfigs.set(tenantId, config);
    return config;
  }

  async listPayments(tenantId: string, studentId?: string) {
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

    let studentId = data.studentId;

    let dbInvoice: any = null;
    if (data.invoiceId) {
      dbInvoice = await this.prisma.invoice.findFirst({
        where: {
          tenantId,
          OR: [{ id: data.invoiceId }, { invoiceNumber: data.invoiceId }],
        },
      });
      if (dbInvoice && !studentId) {
        studentId = dbInvoice.studentId;
      }
    }

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

      const nameParts = (data.student || 'Student User').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Student';
      const lastName = nameParts.slice(1).join(' ') || 'User';
      const admNo = typeof studentId === 'string' && !studentId.startsWith('std_adhoc') ? studentId : `ADM-${Date.now().toString().slice(-6)}`;

      dbStudent = await this.prisma.student.create({
        data: {
          id: `std_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId,
          campusId: campus.id,
          admissionNumber: admNo,
          firstName,
          lastName,
          gender: 'OTHER',
          status: 'ACTIVE',
        },
      });
    }

    const amount = Number(data.amount || 0);
    const currency = data.currency || dbInvoice?.currency || 'NGN';
    const paidAt = new Date(data.date || Date.now());

    if (!dbInvoice && data.invoiceId) {
      const invNumber = typeof data.invoiceId === 'string' ? data.invoiceId : `INV-${Date.now().toString().slice(-6)}`;
      dbInvoice = await this.prisma.invoice.create({
        data: {
          id: `inv_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId,
          studentId: dbStudent.id,
          invoiceNumber: invNumber,
          totalAmount: amount,
          paidAmount: 0,
          balanceAmount: amount,
          currency,
          dueDate: new Date(Date.now() + 30 * 86400000),
          status: 'PENDING',
          notes: data.feesCovered || 'Tuition Fees',
        },
      });
    }

    const providerMapped = this.mapPaymentProvider(data.gateway || data.channel || 'Direct Bank Transfer');

    const payment = await this.prisma.$transaction(async (tx) => {
      const createdPayment = await tx.payment.create({
        data: {
          id,
          tenantId,
          invoiceId: dbInvoice?.id || null,
          studentId: dbStudent.id,
          reference,
          transactionId: `TXN_${randomUUID().substring(0, 8).toUpperCase()}`,
          amount,
          currency,
          provider: providerMapped,
          status: 'SUCCESSFUL',
          paidAt,
          metadata: {
            payerName: data.payerName || 'Parent/Guardian',
            payerEmail: data.payerEmail || 'parent@school.edu.ng',
            notes: data.note || data.notes || data.feesCovered || 'Fee payment',
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
            paidAt: paidAt.toISOString(),
          },
          tx,
        );
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          action: 'OFFLINE_PAYMENT_RECORDED',
          resourceType: 'Payment',
          resourceId: id,
          afterData: {
            reference,
            amount,
            currency,
            invoiceId: dbInvoice?.id || data.invoiceId,
            studentId: dbStudent.id,
            paymentMethod: data.gateway || data.channel,
            payerName: data.payerName,
            paidAt: paidAt.toISOString(),
          } as any,
        },
      });

      return createdPayment;
    });

    return {
      success: true,
      message: 'Payment recorded and invoice credited successfully.',
      payment: {
        ...payment,
        id: payment.id,
        student: `${dbStudent.firstName} ${dbStudent.lastName}`,
        class: data.class || 'JSS 1A',
        gateway: payment.provider,
        date: payment.paidAt ? payment.paidAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        status: 'Success',
      },
    };
  }

  async initializePayment(tenantId: string, dto: InitializePaymentDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        OR: [{ id: dto.invoiceId }, { invoiceNumber: dto.invoiceId }],
      },
      include: { student: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.balanceAmount <= 0) {
      throw new BadRequestException('This invoice has already been fully paid.');
    }

    const student = invoice.student;
    const targetStudentId = dto.studentId || invoice.studentId;

    const config = await this.getGatewayConfig(tenantId);
    const provider = dto.provider || config.defaultProvider || PaymentGatewayProvider.PAYSTACK;
    const reference = `PAY-${Date.now()}-${randomUUID().substring(0, 8).toUpperCase()}`;
    const id = `pmt_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const currency = dto.currency || invoice.currency || 'NGN';

    const payment = await this.prisma.payment.create({
      data: {
        id,
        tenantId,
        invoiceId: invoice.id,
        studentId: targetStudentId,
        reference,
        amount: dto.amount,
        currency,
        provider: this.mapPaymentProvider(provider),
        status: 'PENDING',
        metadata: {
          callbackUrl: dto.callbackUrl,
          invoiceNumber: invoice.invoiceNumber,
          channel: dto.channel || 'CARD',
          subaccountCode: dto.subaccountCode || config.subaccountCode,
        },
        idempotencyKey: reference,
      },
    });

    const email = dto.customerEmail || 'parent@schoolportal.ng';
    const secretKey =
      provider === PaymentGatewayProvider.FLUTTERWAVE
        ? config.flutterwaveSecretKey
        : config.paystackSecretKey;
    const publicKey =
      provider === PaymentGatewayProvider.FLUTTERWAVE
        ? config.flutterwavePublicKey
        : config.paystackPublicKey;

    const initParams = {
      amount: dto.amount,
      currency,
      customerEmail: email,
      reference,
      callbackUrl: dto.callbackUrl,
      secretKey: secretKey || undefined,
      publicKey: publicKey || undefined,
      metadata: { invoiceId: dto.invoiceId, tenantId, subaccountCode: dto.subaccountCode || config.subaccountCode },
    };

    const initResult =
      provider === PaymentGatewayProvider.FLUTTERWAVE
        ? await this.flutterwaveAdapter.initializePayment(initParams)
        : await this.paystackAdapter.initializePayment(initParams);

    return {
      payment: {
        ...payment,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      },
      checkoutUrl: initResult.authorizationUrl,
      accessCode: initResult.accessCode || reference,
      reference,
    };
  }

  async createVirtualAccount(tenantId: string, dto: CreateVirtualAccountDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        OR: [{ id: dto.invoiceId }, { invoiceNumber: dto.invoiceId }],
      },
    });

    if (!invoice) {
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
    const payment = await this.prisma.payment.findFirst({
      where: { reference },
      include: { invoice: true, student: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment reference not found');
    }

    if (payment.tenantId !== tenantId) {
      throw new ForbiddenException('Cross-tenant payment violation: Reference belongs to another school organization.');
    }

    if (payment.status === 'SUCCESSFUL') {
      return { success: true, message: 'Payment already verified and credited.', payment };
    }

    const config = await this.getGatewayConfig(tenantId);
    const secretKey =
      payment.provider === 'FLUTTERWAVE'
        ? config.flutterwaveSecretKey
        : config.paystackSecretKey;

    const adapter =
      payment.provider === 'FLUTTERWAVE'
        ? this.flutterwaveAdapter
        : this.paystackAdapter;

    const verification = await adapter.verifyPayment(reference, secretKey || undefined);
    if (!verification.success || verification.status !== 'successful') {
      await this.prisma.payment.updateMany({
        where: { tenantId, reference },
        data: { status: 'FAILED' },
      }).catch(() => {});
      throw new BadRequestException('Payment gateway verification failed or uncompleted.');
    }

    // Underpayment Check
    if (
      verification.amount !== undefined &&
      !(verification.rawPayload as any)?.isDevSimulation &&
      Number(verification.amount) < Number(payment.amount)
    ) {
      throw new BadRequestException(
        `Underpayment detected: Paid ₦${verification.amount} but expected ₦${payment.amount}. Settlement rejected.`,
      );
    }

    // Currency Check
    if (
      verification.currency &&
      payment.currency &&
      verification.currency.toUpperCase() !== payment.currency.toUpperCase()
    ) {
      throw new BadRequestException(
        `Currency mismatch: Expected ${payment.currency} but received ${verification.currency}. Settlement rejected.`,
      );
    }

    const paidAt = verification.paidAt ? new Date(verification.paidAt) : new Date();
    const transactionId = (verification as any).transactionId || (verification.rawPayload as any)?.id || (verification.rawPayload as any)?.transaction_id || `TXN_${randomUUID().substring(0, 10).toUpperCase()}`;
    const channel = verification.channel || (payment.metadata as any)?.channel || 'CARD';

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

      await tx.auditLog.create({
        data: {
          tenantId,
          action: 'ONLINE_PAYMENT_VERIFIED',
          resourceType: 'Payment',
          resourceId: payment.id,
          afterData: {
            reference: payment.reference,
            amount: payment.amount,
            currency: payment.currency,
            invoiceId: payment.invoiceId,
            channel,
            transactionId,
            verifiedAt: paidAt.toISOString(),
          } as any,
        },
      });
    });

    const updatedPayment = await this.prisma.payment.findUnique({
      where: { id: payment.id },
      include: { invoice: true, student: true },
    });

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

    // Cross-Module Trigger: In-App Inbox Notification for Linked Parent(s)
    const formattedAmount = Number(payment.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 });
    const notifTitle = `Payment Received: ${payment.reference}`;
    const studentName = payment.student ? `${payment.student.firstName} ${payment.student.lastName}` : 'student';
    const notifMessage = `Payment of ${payment.currency} ${formattedAmount} for ${studentName} has been verified and credited successfully.`;

    if (payment.studentId) {
      try {
        const studentParents = await this.prisma.studentParent.findMany({
          where: {
            studentId: payment.studentId,
          },
          include: {
            parent: {
              select: { userId: true },
            },
          },
        });

        for (const sp of studentParents) {
          if (sp.parent?.userId) {
            await this.prisma.inAppInboxItem.create({
              data: {
                id: `inb_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
                tenantId,
                recipientUserId: sp.parent.userId,
                category: 'FINANCE',
                priority: 'HIGH',
                title: notifTitle,
                message: notifMessage,
                actionUrl: '/parent',
                isRead: false,
              },
            }).catch(() => {});
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not persist payment in-app inbox item: ${err.message}`);
      }
    }

    return { success: true, message: 'Payment verified and credited successfully!', payment: updatedPayment };
  }

  async handleWebhook(
    provider: 'paystack' | 'flutterwave',
    payload: any,
    signature: string,
    rawBody?: string | Buffer,
  ) {
    const adapter = provider === 'flutterwave' ? this.flutterwaveAdapter : this.paystackAdapter;
    const isValid = adapter.verifyWebhookSignature(signature, rawBody || JSON.stringify(payload));
    if (!isValid) {
      this.logger.warn(`Rejected invalid or unsigned ${provider} webhook signature.`);
      throw new BadRequestException('Invalid cryptographic webhook signature');
    }

    const reference = payload?.data?.reference || payload?.txRef || payload?.data?.tx_ref;
    if (!reference) return { received: true, message: 'No reference in payload' };

    const payment = await this.prisma.payment.findFirst({ where: { reference } });

    if (!payment) return { received: true, message: 'Payment reference unrecognized' };
    if (payment.status === 'SUCCESSFUL') return { received: true, message: 'Idempotent: Already processed' };

    return this.verifyPayment(payment.tenantId, reference);
  }

  async getReceipt(tenantId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
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

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    const student = payment.student;
    const invoice = payment.invoice;
    const tenant = payment.tenant;

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
        fullName: student ? `${student.firstName} ${student.lastName}` : 'Student',
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
    const payment = await this.prisma.payment.findFirst({
      where: { tenantId, id: paymentId },
      include: { invoice: true },
    });

    if (!payment || payment.tenantId !== tenantId) throw new NotFoundException('Payment not found');
    if (payment.status !== 'SUCCESSFUL') throw new BadRequestException('Only successful payments can be refunded');

    const refundDate = new Date();

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

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: refundedByUserId || null,
          action: 'PAYMENT_REFUNDED',
          resourceType: 'Payment',
          resourceId: payment.id,
          afterData: {
            reference: payment.reference,
            amount: payment.amount,
            reason,
            refundedByUserId,
            refundedAt: refundDate.toISOString(),
          } as any,
        },
      });
    });

    const updatedPayment = await this.prisma.payment.findUnique({
      where: { id: payment.id },
      include: { invoice: true },
    });

    return { success: true, message: 'Payment refunded successfully', payment: updatedPayment };
  }

  async reconcilePendingPayments(tenantId: string) {
    const pendings = await this.prisma.payment.findMany({
      where: { tenantId, status: 'PENDING' },
    });
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
