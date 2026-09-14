import { AgingBucket } from '../dto/debt-recovery.dto.js';

export interface AgingSummary {
  current: number; // 0-30 days overdue
  days31_60: number; // 31-60 days overdue
  days61_90: number; // 61-90 days overdue
  days90Plus: number; // >90 days overdue
  totalDefaulters: number;
  totalDebtAmount: number;
}

export interface CollectionMetrics {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRatePercentage: number;
  currency: string;
  agingSummary: AgingSummary;
}

export class AgingAnalysisCalculator {
  /**
   * Calculates number of days overdue relative to a reference date (defaults to today).
   */
  static calculateDaysOverdue(dueDate: Date | string, referenceDate: Date = new Date()): number {
    const due = new Date(dueDate).getTime();
    const ref = referenceDate.getTime();
    const diffMs = ref - due;
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Categorizes days overdue into an AgingBucket.
   */
  static categorizeBucket(daysOverdue: number): AgingBucket {
    if (daysOverdue <= 30) return AgingBucket.CURRENT;
    if (daysOverdue <= 60) return AgingBucket.DAYS_31_60;
    if (daysOverdue <= 90) return AgingBucket.DAYS_61_90;
    return AgingBucket.DAYS_90_PLUS;
  }

  /**
   * Evaluates whole invoice collection metrics and calculates aging summary.
   */
  static calculateMetrics(invoices: any[], referenceDate: Date = new Date()): CollectionMetrics {
    let totalInvoiced = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    const currency = invoices[0]?.currency || 'NGN';

    const agingSummary: AgingSummary = {
      current: 0,
      days31_60: 0,
      days61_90: 0,
      days90Plus: 0,
      totalDefaulters: 0,
      totalDebtAmount: 0,
    };

    for (const inv of invoices) {
      if (inv.status === 'CANCELLED') continue;

      const total = inv.totalAmount || 0;
      const paid = inv.paidAmount || 0;
      const balance = Math.max(0, inv.balanceAmount ?? total - paid);

      totalInvoiced += total;
      totalCollected += paid;
      totalOutstanding += balance;

      if (balance > 0 && inv.dueDate) {
        const daysOverdue = this.calculateDaysOverdue(inv.dueDate, referenceDate);
        if (daysOverdue > 0) {
          agingSummary.totalDefaulters++;
          agingSummary.totalDebtAmount += balance;

          const bucket = this.categorizeBucket(daysOverdue);
          if (bucket === AgingBucket.CURRENT) agingSummary.current += balance;
          else if (bucket === AgingBucket.DAYS_31_60) agingSummary.days31_60 += balance;
          else if (bucket === AgingBucket.DAYS_61_90) agingSummary.days61_90 += balance;
          else agingSummary.days90Plus += balance;
        }
      }
    }

    const collectionRatePercentage =
      totalInvoiced > 0
        ? Number(((totalCollected / totalInvoiced) * 100).toFixed(2))
        : 0;

    return {
      totalInvoiced: Number(totalInvoiced.toFixed(2)),
      totalCollected: Number(totalCollected.toFixed(2)),
      totalOutstanding: Number(totalOutstanding.toFixed(2)),
      collectionRatePercentage,
      currency,
      agingSummary: {
        current: Number(agingSummary.current.toFixed(2)),
        days31_60: Number(agingSummary.days31_60.toFixed(2)),
        days61_90: Number(agingSummary.days61_90.toFixed(2)),
        days90Plus: Number(agingSummary.days90Plus.toFixed(2)),
        totalDefaulters: agingSummary.totalDefaulters,
        totalDebtAmount: Number(agingSummary.totalDebtAmount.toFixed(2)),
      },
    };
  }
}
