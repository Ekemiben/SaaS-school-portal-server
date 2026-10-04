import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { DisbursementProviderFactory } from './disbursement/disbursement-provider.factory.js';
import { DisburseIndividualPayrollDto, BulkDisbursePayrollDto } from './dto/payroll-disbursement.dto.js';

@Injectable()
export class PayrollDisbursementService {
  private readonly logger = new Logger(PayrollDisbursementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: DisbursementProviderFactory,
  ) {}

  async disbursePayroll(tenantId: string, payrollId: string, dto?: DisburseIndividualPayrollDto) {
    const payroll = await this.prisma.payroll.findFirst({
      where: { id: payrollId, tenantId },
    });
    if (!payroll) throw new NotFoundException(`Payroll record "${payrollId}" not found.`);

    const salaryProfile = await this.prisma.staffSalaryProfile.findFirst({
      where: { tenantId, staffUserId: payroll.staffUserId },
    });

    if (payroll.status === 'PAID') {
      throw new BadRequestException(`Payroll "${payrollId}" has already been paid.`);
    }

    // Resolve bank account details
    const accountNumber = dto?.accountNumber || salaryProfile?.accountNumber;
    const bankCode = dto?.bankCode || salaryProfile?.bankCode;
    const bankName = dto?.bankName || salaryProfile?.bankName;
    const accountName = dto?.accountName || salaryProfile?.accountName;

    if (!accountNumber) {
      throw new BadRequestException(
        `Staff "${payroll.staffUserId}" does not have bank account details configured for automated disbursement.`,
      );
    }

    const provider = this.providerFactory.getProvider(dto?.provider);
    const reference = `TRF_${payroll.tenantId.substring(0, 6)}_${payroll.id.replace(/-/g, '').substring(0, 8)}_${Date.now()}`;

    // Initiate Transfer via Provider Adapter
    const transferResult = await provider.initiateTransfer({
      amount: payroll.netSalary,
      currency: payroll.currency || 'NGN',
      recipient: {
        bankCode: bankCode || undefined,
        bankName: bankName || undefined,
        accountNumber,
        accountName: accountName || undefined,
      },
      reference,
      reason: dto?.reason || `Salary payment for ${payroll.month}/${payroll.year}`,
      tenantId,
      payrollId,
    });

    const isDirectSuccess = transferResult.status === 'SUCCESS';
    const newStatus = isDirectSuccess ? 'PAID' : 'PROCESSING';

    await this.prisma.payroll.update({
      where: { id: payrollId },
      data: {
        status: newStatus,
        paymentReference: reference,
        ...(isDirectSuccess ? { paymentDate: new Date() } : {}),
      },
    });

    return {
      payrollId,
      staffUserId: payroll.staffUserId,
      netSalary: payroll.netSalary,
      currency: payroll.currency || 'NGN',
      paymentReference: reference,
      transferStatus: transferResult.status,
      payrollStatus: newStatus,
      provider: transferResult.provider,
      recipientAccount: accountNumber,
    };
  }

  async bulkDisbursePayroll(tenantId: string, dto: BulkDisbursePayrollDto) {
    const approvedPayrolls = await this.prisma.payroll.findMany({
      where: {
        tenantId,
        month: Number(dto.month),
        year: Number(dto.year),
        status: 'APPROVED',
        ...(dto.campusId && { campusId: dto.campusId }),
      },
    });

    const successful: any[] = [];
    const pending: any[] = [];
    const failed: any[] = [];
    let totalDisbursedAmount = 0;

    for (const payroll of approvedPayrolls) {
      try {
        const result = await this.disbursePayroll(tenantId, payroll.id, { provider: dto.provider });
        if (result.payrollStatus === 'PAID') {
          successful.push(result);
        } else {
          pending.push(result);
        }
        totalDisbursedAmount += payroll.netSalary;
      } catch (err: any) {
        this.logger.error(`Failed to disburse payroll "${payroll.id}": ${err?.message}`);
        failed.push({ payrollId: payroll.id, staffUserId: payroll.staffUserId, reason: err?.message });
      }
    }

    return {
      month: Number(dto.month),
      year: Number(dto.year),
      campusId: dto.campusId || null,
      totalProcessed: approvedPayrolls.length,
      totalDisbursedAmount: Math.round(totalDisbursedAmount * 100) / 100,
      successfulCount: successful.length,
      pendingCount: pending.length,
      failedCount: failed.length,
      successful,
      pending,
      failed,
    };
  }

  async reconcilePayroll(tenantId: string, payrollId: string, providerName?: string) {
    const payroll = await this.prisma.payroll.findFirst({ where: { id: payrollId, tenantId } });

    if (!payroll) {
      throw new NotFoundException(`Payroll record "${payrollId}" not found.`);
    }

    if (!payroll.paymentReference) {
      return { payrollId, status: payroll.status, message: 'No disbursement reference recorded yet.' };
    }

    const provider = this.providerFactory.getProvider(providerName);
    const verifyResult = await provider.verifyTransfer(payroll.paymentReference);

    if (verifyResult.status === 'SUCCESS') {
      await this.prisma.payroll.update({
        where: { id: payrollId },
        data: { status: 'PAID', paymentDate: verifyResult.settledAt || new Date() },
      });
    }

    return {
      payrollId,
      paymentReference: payroll.paymentReference,
      status: verifyResult.status,
      gatewayResponse: verifyResult.gatewayResponse,
    };
  }

  async processWebhook(providerName: string, signature: string, payload: any, rawBody: string | Buffer) {
    const provider = this.providerFactory.getProvider(providerName);
    const isValid = provider.verifyWebhookSignature(signature, rawBody);
    if (!isValid) {
      throw new UnauthorizedException(`Invalid signature for ${providerName} disbursement webhook.`);
    }

    const reference = payload?.data?.reference || payload?.data?.transfer_code;
    const event = payload?.event || payload?.['event.type'];

    if (!reference) {
      return { status: 'IGNORED', message: 'No transfer reference found in webhook payload.' };
    }

    const isSuccess = event === 'transfer.success' || event === 'transfer.completed';
    const isFailed = event === 'transfer.failed' || event === 'transfer.reversed';

    const payroll = await this.prisma.payroll.findFirst({ where: { paymentReference: reference } });
    if (payroll) {
      await this.prisma.payroll.update({
        where: { id: payroll.id },
        data: {
          status: isSuccess ? 'PAID' : isFailed ? 'FAILED' : payroll.status,
          ...(isSuccess ? { paymentDate: new Date() } : {}),
        },
      });
    }

    return { status: 'PROCESSED', reference, event };
  }
}
