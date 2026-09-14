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
  status: 'ACTIVE' | 'SUSPENDED';
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
  paymentReference?: string;
  channel?: string;
  description: string;
  status: WalletTransactionStatus;
  metadata?: Record<string, any>;
  createdAt: string;
}

@Injectable()
export class CommunicationWalletService {
  private readonly logger = new Logger(CommunicationWalletService.name);
  private readonly fallbackWallets = new Map<string, CommunicationWalletRecord>();
  private readonly fallbackTransactions: CommunicationWalletTransactionRecord[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateWallet(tenantId: string): Promise<CommunicationWalletRecord> {
    const existing = this.fallbackWallets.get(tenantId);
    if (existing) return existing;

    const newWallet: CommunicationWalletRecord = {
      id: `cwal_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
      tenantId,
      currency: 'NGN',
      balance: 0.0,
      status: 'ACTIVE',
      monthlyUsage: 0.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.fallbackWallets.set(tenantId, newWallet);
    return newWallet;
  }

  async creditWallet(
    tenantId: string,
    amount: number,
    paymentReference: string,
    description: string,
    metadata?: Record<string, any>,
  ): Promise<{ wallet: CommunicationWalletRecord; transaction: CommunicationWalletTransactionRecord }> {
    // Idempotency check: if paymentReference was already processed, return existing
    const duplicate = this.fallbackTransactions.find(
      (t) => t.tenantId === tenantId && t.paymentReference === paymentReference && t.status === WalletTransactionStatus.SUCCESSFUL,
    );

    const wallet = await this.getOrCreateWallet(tenantId);
    if (duplicate) {
      this.logger.warn(`Idempotent duplicate credit request for reference ${paymentReference}`);
      return { wallet, transaction: duplicate };
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = Number((balanceBefore + amount).toFixed(2));
    wallet.balance = balanceAfter;
    wallet.updatedAt = new Date().toISOString();

    const transaction: CommunicationWalletTransactionRecord = {
      id: `cwtx_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
      tenantId,
      walletId: wallet.id,
      type: WalletTransactionType.CREDIT,
      amount,
      balanceBefore,
      balanceAfter,
      reference: `CTX-${Date.now()}-${randomUUID().substring(0, 6).toUpperCase()}`,
      paymentReference,
      description,
      status: WalletTransactionStatus.SUCCESSFUL,
      metadata,
      createdAt: new Date().toISOString(),
    };

    this.fallbackTransactions.push(transaction);
    this.logger.log(`Credited ₦${amount} to communication wallet for tenant ${tenantId}. Balance: ₦${balanceAfter}`);
    return { wallet, transaction };
  }

  async debitWallet(
    tenantId: string,
    amount: number,
    channel: string,
    description: string,
    metadata?: Record<string, any>,
  ): Promise<{ success: boolean; balanceAfter?: number; error?: string; transaction?: CommunicationWalletTransactionRecord }> {
    const wallet = await this.getOrCreateWallet(tenantId);

    if (wallet.balance < amount) {
      return {
        success: false,
        error: `Insufficient communication funds. Required: ₦${amount}, Current balance: ₦${wallet.balance}`,
      };
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = Number((balanceBefore - amount).toFixed(2));
    wallet.balance = balanceAfter;
    wallet.monthlyUsage = Number((wallet.monthlyUsage + amount).toFixed(2));
    wallet.updatedAt = new Date().toISOString();

    const transaction: CommunicationWalletTransactionRecord = {
      id: `cwtx_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
      tenantId,
      walletId: wallet.id,
      type: WalletTransactionType.DEBIT,
      amount,
      balanceBefore,
      balanceAfter,
      reference: `CTX-${Date.now()}-${randomUUID().substring(0, 6).toUpperCase()}`,
      channel,
      description,
      status: WalletTransactionStatus.SUCCESSFUL,
      metadata,
      createdAt: new Date().toISOString(),
    };

    this.fallbackTransactions.push(transaction);
    return { success: true, balanceAfter, transaction };
  }

  async refundTransaction(
    tenantId: string,
    transactionId: string,
    reason: string,
  ): Promise<CommunicationWalletTransactionRecord> {
    const original = this.fallbackTransactions.find(
      (t) => t.tenantId === tenantId && t.id === transactionId,
    );
    if (!original) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    const wallet = await this.getOrCreateWallet(tenantId);
    const balanceBefore = wallet.balance;
    const balanceAfter = Number((balanceBefore + original.amount).toFixed(2));
    wallet.balance = balanceAfter;
    wallet.updatedAt = new Date().toISOString();

    const refundTx: CommunicationWalletTransactionRecord = {
      id: `cwtx_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
      tenantId,
      walletId: wallet.id,
      type: WalletTransactionType.REFUND,
      amount: original.amount,
      balanceBefore,
      balanceAfter,
      reference: `REF-${Date.now()}-${randomUUID().substring(0, 6).toUpperCase()}`,
      paymentReference: original.reference,
      description: `Refund for ${original.reference}: ${reason}`,
      status: WalletTransactionStatus.SUCCESSFUL,
      metadata: { originalTransactionId: transactionId, reason },
      createdAt: new Date().toISOString(),
    };

    this.fallbackTransactions.push(refundTx);
    return refundTx;
  }

  async listTransactions(
    tenantId: string,
    filter?: WalletTransactionFilterDto,
  ): Promise<CommunicationWalletTransactionRecord[]> {
    let results = this.fallbackTransactions.filter((t) => t.tenantId === tenantId);

    if (filter?.type) {
      results = results.filter((t) => t.type === filter.type);
    }
    if (filter?.status) {
      results = results.filter((t) => t.status === filter.status);
    }
    if (filter?.channel) {
      results = results.filter((t) => t.channel === filter.channel);
    }

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}
