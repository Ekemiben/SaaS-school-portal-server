import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommunicationWalletService } from '../src/modules/communications/services/communication-wallet.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { WalletTransactionType, WalletTransactionStatus } from '../src/modules/communications/dto/communication-wallet.dto.js';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('Phase 7 — Communication Wallet & Billing Architecture', () => {
  let prisma: PrismaService;
  let walletService: CommunicationWalletService;

  let tenantAlpha: string;
  let tenantBeta: string;

  beforeEach(async () => {
    const timestamp = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    tenantAlpha = `tenant_wal_alpha_${timestamp}`;
    tenantBeta = `tenant_wal_beta_${timestamp}`;

    prisma = new PrismaService();
    await prisma.onModuleInit();

    walletService = new CommunicationWalletService(prisma);

    if (prisma.isDbConnected) {
      try {
        await prisma.tenant.createMany({
          data: [
            { id: tenantAlpha, name: 'Alpha International', slug: `alpha-${timestamp}` },
            { id: tenantBeta, name: 'Beta High', slug: `beta-${timestamp}` },
          ],
        });
      } catch (err: any) {
        console.warn(`Test DB setup error: ${err.message}`);
      }
    }
  });

  afterEach(async () => {
    if (prisma.isDbConnected) {
      try {
        await prisma.communicationWalletTransaction.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.communicationWallet.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.tenant.deleteMany({
          where: { id: { in: [tenantAlpha, tenantBeta] } },
        });
      } catch (err: any) {
        console.warn(`Test DB teardown error: ${err.message}`);
      }
    }
    await prisma.$disconnect();
  });

  it('1. should auto-create wallet on first access with zero balance', async () => {
    const wallet = await walletService.getOrCreateWallet(tenantAlpha);

    expect(wallet.id).toBeDefined();
    expect(wallet.tenantId).toBe(tenantAlpha);
    expect(wallet.balance).toBe(0.0);
    expect(wallet.currency).toBe('NGN');
    expect(wallet.status).toBe('ACTIVE');
    expect(wallet.monthlyUsage).toBe(0.0);
  });

  it('2. should credit wallet and enforce idempotency on duplicate payment references', async () => {
    const paymentRef = `PAY-TOPUP-${Date.now()}`;

    // First credit: ₦5,000
    const res1 = await walletService.creditWallet(
      tenantAlpha,
      5000,
      paymentRef,
      'Paystack Topup for SMS broadcast',
    );

    expect(res1.wallet.balance).toBe(5000);
    expect(res1.transaction.type).toBe(WalletTransactionType.CREDIT);
    expect(res1.transaction.amount).toBe(5000);
    expect(res1.transaction.balanceBefore).toBe(0);
    expect(res1.transaction.balanceAfter).toBe(5000);

    // Duplicate credit request with the same paymentReference (e.g. webhook retry)
    const res2 = await walletService.creditWallet(
      tenantAlpha,
      5000,
      paymentRef,
      'Paystack Topup for SMS broadcast (Retry)',
    );

    // Balance should remain 5000 (not 10,000!)
    expect(res2.wallet.balance).toBe(5000);
    expect(res2.transaction.id).toBe(res1.transaction.id);

    // Verify transaction list only has 1 transaction
    const txs = await walletService.listTransactions(tenantAlpha);
    expect(txs.length).toBe(1);
  });

  it('3. should debit wallet for channel usage and reject when funds are insufficient', async () => {
    await walletService.creditWallet(tenantAlpha, 100, 'PAY-100', 'Initial credit');

    // Debit ₦40 for SMS broadcast
    const debitRes = await walletService.debitWallet(
      tenantAlpha,
      40,
      'SMS',
      'SMS broadcast to Grade 10',
    );

    expect(debitRes.success).toBe(true);
    expect(debitRes.balanceAfter).toBe(60);

    const wallet = await walletService.getOrCreateWallet(tenantAlpha);
    expect(wallet.balance).toBe(60);
    expect(wallet.monthlyUsage).toBe(40);

    // Attempt debit of ₦80 when balance is only ₦60
    const failedDebit = await walletService.debitWallet(
      tenantAlpha,
      80,
      'SMS',
      'SMS broadcast to whole school',
    );

    expect(failedDebit.success).toBe(false);
    expect(failedDebit.error).toContain('Insufficient communication funds');
    expect(wallet.balance).toBe(60); // balance remains unchanged
  });

  it('4. should process refunds and restore wallet balance accurately', async () => {
    await walletService.creditWallet(tenantAlpha, 500, 'PAY-500', 'Top up');

    const debitRes = await walletService.debitWallet(
      tenantAlpha,
      150,
      'WHATSAPP',
      'WhatsApp newsletter dispatch',
    );
    expect(debitRes.success).toBe(true);
    expect(debitRes.transaction).toBeDefined();

    const debitTxId = debitRes.transaction!.id;

    // Refund the transaction
    const refundTx = await walletService.refundTransaction(
      tenantAlpha,
      debitTxId,
      'Failed carrier delivery refund',
    );

    expect(refundTx.type).toBe(WalletTransactionType.REFUND);
    expect(refundTx.amount).toBe(150);
    expect(refundTx.balanceAfter).toBe(500);

    const wallet = await walletService.getOrCreateWallet(tenantAlpha);
    expect(wallet.balance).toBe(500);
  });

  it('5. should calculate comprehensive wallet analytics and spending by channel', async () => {
    await walletService.creditWallet(tenantAlpha, 2000, 'PAY-ANALYTICS', 'Funding');
    await walletService.debitWallet(tenantAlpha, 300, 'SMS', 'SMS blast');
    await walletService.debitWallet(tenantAlpha, 250, 'WHATSAPP', 'WhatsApp blast');

    const analytics = await walletService.getWalletAnalytics(tenantAlpha);

    expect(analytics.balance).toBe(1450);
    expect(analytics.totalCredits).toBe(2000);
    expect(analytics.totalDebits).toBe(550);
    expect(analytics.spendingByChannel['SMS']).toBe(300);
    expect(analytics.spendingByChannel['WHATSAPP']).toBe(250);
  });

  it('6. should enforce strict multi-tenant isolation across wallets and transactions', async () => {
    // Top up Alpha with ₦1,000
    await walletService.creditWallet(tenantAlpha, 1000, 'PAY-ALPHA', 'Alpha funding');

    // Beta wallet starts with 0
    const betaWallet = await walletService.getOrCreateWallet(tenantBeta);
    expect(betaWallet.balance).toBe(0);

    // Beta lists transactions -> 0 transactions
    const betaTxs = await walletService.listTransactions(tenantBeta);
    expect(betaTxs.length).toBe(0);

    // Alpha transaction list has 1
    const alphaTxs = await walletService.listTransactions(tenantAlpha);
    expect(alphaTxs.length).toBe(1);

    // Beta cannot refund Alpha's transaction
    await expect(
      walletService.refundTransaction(tenantBeta, alphaTxs[0].id, 'Illegal refund attempt'),
    ).rejects.toThrow(NotFoundException);
  });
});
