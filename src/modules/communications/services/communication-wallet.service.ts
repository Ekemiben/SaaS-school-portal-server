import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  WalletTransactionType,
  WalletTransactionStatus,
  WalletTransactionFilterDto,
} from '../dto/communication-wallet.dto.js';
import { randomUUID } from 'crypto';

export interface CommunicationWalletRecord {
  id: string;
  tenantId: string;
  currency: string;
  balance: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'FROZEN';
  monthlyUsage: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationWalletTransactionRecord {
  id: string;
  tenantId: string;
  walletId: string;
  type: WalletTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  paymentReference?: string | null;
  channel?: string | null;
  description: string;
  status: WalletTransactionStatus;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface WalletAnalyticsSummary {
  balance: number;
  currency: string;
  status: string;
  monthlyUsage: number;
  totalCredits: number;
  totalDebits: number;
  totalRefunds: number;
  spendingByChannel: Record<string, number>;
}

@Injectable()
export class CommunicationWalletService {
  private readonly logger = new Logger(CommunicationWalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateWallet(tenantId: string): Promise<CommunicationWalletRecord> {
    const now = new Date();

    if (this.prisma.isDbConnected) {
      try {
        let wallet = await this.prisma.communicationWallet.findUnique({
          where: { tenantId },
        });

        if (!wallet) {
          const walletId = `cwal_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
          wallet = await this.prisma.communicationWallet.create({
            data: {
              id: walletId,
              tenantId,
              currency: 'NGN',
              balance: 0.0,
              status: 'ACTIVE',
              monthlyUsage: 0.0,
              createdAt: now,
              updatedAt: now,
            },
          });
        }

        const record: CommunicationWalletRecord = {
          id: wallet.id,
          tenantId: wallet.tenantId,
          currency: wallet.currency,
          balance: Number(wallet.balance),
          status: wallet.status as any,
          monthlyUsage: Number(wallet.monthlyUsage),
          createdAt: wallet.createdAt.toISOString(),
          updatedAt: wallet.updatedAt.toISOString(),
        };

        this.prisma.memoryStore.communicationWallets.set(tenantId, record);
        return record;
      } catch (err: any) {
        this.logger.warn(`Could not fetch/create wallet in DB: ${err.message}`);
      }
    }

    // Memory store fallback
    let fallback = this.prisma.memoryStore.communicationWallets.get(tenantId);
    if (!fallback) {
      fallback = {
        id: `cwal_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
        tenantId,
        currency: 'NGN',
        balance: 0.0,
        status: 'ACTIVE',
        monthlyUsage: 0.0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      this.prisma.memoryStore.communicationWallets.set(tenantId, fallback);
    }
    return fallback;
  }

  async creditWallet(
    tenantId: string,
    amount: number,
    paymentReference: string,
    description: string,
    metadata?: Record<string, any>,
  ): Promise<{ wallet: CommunicationWalletRecord; transaction: CommunicationWalletTransactionRecord }> {
    if (amount <= 0) {
      throw new BadRequestException('Credit amount must be greater than 0');
    }

    const now = new Date();

    // Idempotency check: if paymentReference was already processed, return existing
    if (this.prisma.isDbConnected) {
      try {
        const duplicate = await this.prisma.communicationWalletTransaction.findFirst({
          where: {
            tenantId,
            paymentReference,
            status: 'SUCCESS',
          },
        });

        if (duplicate) {
          this.logger.warn(`Idempotent duplicate credit request for reference ${paymentReference}`);
          const wallet = await this.getOrCreateWallet(tenantId);
          return {
            wallet,
            transaction: {
              id: duplicate.id,
              tenantId: duplicate.tenantId,
              walletId: duplicate.walletId,
              type: duplicate.type as any,
              amount: Number(duplicate.amount),
              balanceBefore: Number(duplicate.balanceBefore),
              balanceAfter: Number(duplicate.balanceAfter),
              reference: duplicate.reference,
              paymentReference: duplicate.paymentReference,
              channel: duplicate.channel,
              description: duplicate.description,
              status: duplicate.status as any,
              metadata: duplicate.metadata as any,
              createdAt: duplicate.createdAt.toISOString(),
            },
          };
        }
      } catch (err: any) {
        this.logger.warn(`Could not check idempotency in DB: ${err.message}`);
      }
    }

    const memTxs = Array.from(this.prisma.memoryStore.communicationWalletTransactions.values());
    const duplicate = memTxs.find(
      (t: any) =>
        t.tenantId === tenantId &&
        t.paymentReference === paymentReference &&
        (t.status === 'SUCCESS' || t.status === 'SUCCESSFUL'),
    );
    if (duplicate) {
      const wallet = await this.getOrCreateWallet(tenantId);
      return { wallet, transaction: duplicate };
    }

    const wallet = await this.getOrCreateWallet(tenantId);
    const balanceBefore = wallet.balance;
    const balanceAfter = Number((balanceBefore + amount).toFixed(4));
    wallet.balance = balanceAfter;
    wallet.updatedAt = now.toISOString();

    const transactionId = `cwtx_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const reference = `CTX-${Date.now()}-${randomUUID().substring(0, 6).toUpperCase()}`;

    const transactionRecord: CommunicationWalletTransactionRecord = {
      id: transactionId,
      tenantId,
      walletId: wallet.id,
      type: WalletTransactionType.CREDIT,
      amount: Number(amount.toFixed(4)),
      balanceBefore,
      balanceAfter,
      reference,
      paymentReference,
      channel: metadata?.channel || null,
      description,
      status: WalletTransactionStatus.SUCCESSFUL,
      metadata: metadata || null,
      createdAt: now.toISOString(),
    };

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.communicationWallet.update({
          where: { tenantId },
          data: {
            balance: balanceAfter,
            updatedAt: now,
          },
        });

        await this.prisma.communicationWalletTransaction.create({
          data: {
            id: transactionRecord.id,
            tenantId: transactionRecord.tenantId,
            walletId: transactionRecord.walletId,
            type: 'CREDIT',
            amount: transactionRecord.amount,
            balanceBefore: transactionRecord.balanceBefore,
            balanceAfter: transactionRecord.balanceAfter,
            reference: transactionRecord.reference,
            paymentReference: transactionRecord.paymentReference,
            channel: transactionRecord.channel,
            description: transactionRecord.description,
            status: 'SUCCESS',
            metadata: transactionRecord.metadata as any,
            createdAt: now,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not persist wallet credit in DB: ${err.message}`);
      }
    }

    this.prisma.memoryStore.communicationWallets.set(tenantId, wallet);
    this.prisma.memoryStore.communicationWalletTransactions.set(transactionRecord.id, transactionRecord);

    this.logger.log(
      `Credited ₦${amount} to communication wallet for tenant ${tenantId}. New Balance: ₦${balanceAfter}`,
    );
    return { wallet, transaction: transactionRecord };
  }

  async debitWallet(
    tenantId: string,
    amount: number,
    channel: string,
    description: string,
    metadata?: Record<string, any>,
  ): Promise<{
    success: boolean;
    balanceAfter?: number;
    error?: string;
    transaction?: CommunicationWalletTransactionRecord;
  }> {
    if (amount <= 0) {
      return { success: true, balanceAfter: (await this.getOrCreateWallet(tenantId)).balance };
    }

    const wallet = await this.getOrCreateWallet(tenantId);
    if (wallet.status !== 'ACTIVE') {
      return {
        success: false,
        error: `Communication wallet is currently ${wallet.status}. Please contact support.`,
      };
    }

    if (wallet.balance < amount) {
      return {
        success: false,
        error: `Insufficient communication funds. Required: ₦${amount}, Current balance: ₦${wallet.balance}`,
      };
    }

    const now = new Date();
    const balanceBefore = wallet.balance;
    const balanceAfter = Number((balanceBefore - amount).toFixed(4));
    const monthlyUsage = Number((wallet.monthlyUsage + amount).toFixed(4));

    wallet.balance = balanceAfter;
    wallet.monthlyUsage = monthlyUsage;
    wallet.updatedAt = now.toISOString();

    const transactionId = `cwtx_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const reference = `CTX-${Date.now()}-${randomUUID().substring(0, 6).toUpperCase()}`;

    const transactionRecord: CommunicationWalletTransactionRecord = {
      id: transactionId,
      tenantId,
      walletId: wallet.id,
      type: WalletTransactionType.DEBIT,
      amount: Number(amount.toFixed(4)),
      balanceBefore,
      balanceAfter,
      reference,
      channel,
      description,
      status: WalletTransactionStatus.SUCCESSFUL,
      metadata: metadata || null,
      createdAt: now.toISOString(),
    };

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.communicationWallet.update({
          where: { tenantId },
          data: {
            balance: balanceAfter,
            monthlyUsage,
            updatedAt: now,
          },
        });

        await this.prisma.communicationWalletTransaction.create({
          data: {
            id: transactionRecord.id,
            tenantId: transactionRecord.tenantId,
            walletId: transactionRecord.walletId,
            type: 'DEBIT',
            amount: transactionRecord.amount,
            balanceBefore: transactionRecord.balanceBefore,
            balanceAfter: transactionRecord.balanceAfter,
            reference: transactionRecord.reference,
            channel: transactionRecord.channel,
            description: transactionRecord.description,
            status: 'SUCCESS',
            metadata: transactionRecord.metadata as any,
            createdAt: now,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not persist wallet debit in DB: ${err.message}`);
      }
    }

    this.prisma.memoryStore.communicationWallets.set(tenantId, wallet);
    this.prisma.memoryStore.communicationWalletTransactions.set(transactionRecord.id, transactionRecord);

    return { success: true, balanceAfter, transaction: transactionRecord };
  }

  async refundTransaction(
    tenantId: string,
    transactionId: string,
    reason: string,
  ): Promise<CommunicationWalletTransactionRecord> {
    let original: any = null;

    if (this.prisma.isDbConnected) {
      try {
        original = await this.prisma.communicationWalletTransaction.findFirst({
          where: { tenantId, id: transactionId },
        });
      } catch (err: any) {
        this.logger.warn(`Could not find transaction in DB: ${err.message}`);
      }
    }

    if (!original) {
      original = this.prisma.memoryStore.communicationWalletTransactions.get(transactionId);
    }

    if (!original || original.tenantId !== tenantId) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    const now = new Date();
    const refundAmount = Number(original.amount);
    const wallet = await this.getOrCreateWallet(tenantId);
    const balanceBefore = wallet.balance;
    const balanceAfter = Number((balanceBefore + refundAmount).toFixed(4));

    wallet.balance = balanceAfter;
    wallet.updatedAt = now.toISOString();

    const refundId = `cwtx_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const reference = `REF-${Date.now()}-${randomUUID().substring(0, 6).toUpperCase()}`;

    const refundTx: CommunicationWalletTransactionRecord = {
      id: refundId,
      tenantId,
      walletId: wallet.id,
      type: WalletTransactionType.REFUND,
      amount: refundAmount,
      balanceBefore,
      balanceAfter,
      reference,
      paymentReference: original.reference,
      channel: original.channel,
      description: `Refund for ${original.reference}: ${reason}`,
      status: WalletTransactionStatus.SUCCESSFUL,
      metadata: { originalTransactionId: transactionId, reason },
      createdAt: now.toISOString(),
    };

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.communicationWallet.update({
          where: { tenantId },
          data: {
            balance: balanceAfter,
            updatedAt: now,
          },
        });

        await this.prisma.communicationWalletTransaction.create({
          data: {
            id: refundTx.id,
            tenantId: refundTx.tenantId,
            walletId: refundTx.walletId,
            type: 'REFUND',
            amount: refundTx.amount,
            balanceBefore: refundTx.balanceBefore,
            balanceAfter: refundTx.balanceAfter,
            reference: refundTx.reference,
            paymentReference: refundTx.paymentReference,
            channel: refundTx.channel,
            description: refundTx.description,
            status: 'SUCCESS',
            metadata: refundTx.metadata as any,
            createdAt: now,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not persist refund in DB: ${err.message}`);
      }
    }

    this.prisma.memoryStore.communicationWallets.set(tenantId, wallet);
    this.prisma.memoryStore.communicationWalletTransactions.set(refundTx.id, refundTx);

    this.logger.log(`Refunded ₦${refundAmount} for transaction ${transactionId} (Tenant: ${tenantId})`);
    return refundTx;
  }

  async listTransactions(
    tenantId: string,
    filter?: WalletTransactionFilterDto,
  ): Promise<CommunicationWalletTransactionRecord[]> {
    if (this.prisma.isDbConnected) {
      try {
        const where: any = { tenantId };
        if (filter?.type) where.type = filter.type;
        if (filter?.status) where.status = filter.status === 'SUCCESSFUL' ? 'SUCCESS' : filter.status;
        if (filter?.channel) where.channel = filter.channel;

        const rows = await this.prisma.communicationWalletTransaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        });

        if (rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            tenantId: r.tenantId,
            walletId: r.walletId,
            type: r.type as any,
            amount: Number(r.amount),
            balanceBefore: Number(r.balanceBefore),
            balanceAfter: Number(r.balanceAfter),
            reference: r.reference,
            paymentReference: r.paymentReference,
            channel: r.channel,
            description: r.description,
            status: (r.status === 'SUCCESS' ? WalletTransactionStatus.SUCCESSFUL : r.status) as any,
            metadata: r.metadata as any,
            createdAt: r.createdAt.toISOString(),
          }));
        }
      } catch (err: any) {
        this.logger.warn(`Could not list transactions from DB: ${err.message}`);
      }
    }

    let results = Array.from(this.prisma.memoryStore.communicationWalletTransactions.values()).filter(
      (t: any) => t.tenantId === tenantId,
    );

    if (filter?.type) {
      results = results.filter((t: any) => t.type === filter.type);
    }
    if (filter?.status) {
      results = results.filter((t: any) => t.status === filter.status || (filter.status === 'SUCCESSFUL' && t.status === 'SUCCESS'));
    }
    if (filter?.channel) {
      results = results.filter((t: any) => t.channel === filter.channel);
    }

    return results.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getWalletAnalytics(tenantId: string): Promise<WalletAnalyticsSummary> {
    const wallet = await this.getOrCreateWallet(tenantId);
    const transactions = await this.listTransactions(tenantId);

    let totalCredits = 0;
    let totalDebits = 0;
    let totalRefunds = 0;
    const spendingByChannel: Record<string, number> = {};

    for (const tx of transactions) {
      if (tx.type === WalletTransactionType.CREDIT) {
        totalCredits += tx.amount;
      } else if (tx.type === WalletTransactionType.DEBIT) {
        totalDebits += tx.amount;
        const ch = tx.channel || 'OTHER';
        spendingByChannel[ch] = Number(((spendingByChannel[ch] || 0) + tx.amount).toFixed(4));
      } else if (tx.type === WalletTransactionType.REFUND) {
        totalRefunds += tx.amount;
      }
    }

    return {
      balance: wallet.balance,
      currency: wallet.currency,
      status: wallet.status,
      monthlyUsage: wallet.monthlyUsage,
      totalCredits: Number(totalCredits.toFixed(4)),
      totalDebits: Number(totalDebits.toFixed(4)),
      totalRefunds: Number(totalRefunds.toFixed(4)),
      spendingByChannel,
    };
  }
}
