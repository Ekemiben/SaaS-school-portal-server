import { FeeItemDto } from '../dto/fee-structure.dto.js';

export interface FeeLineItemResult {
  name: string;
  code: string;
  category: string;
  amount: number;
  isOptional: boolean;
  isIncluded: boolean;
}

export interface FeeEvaluationResult {
  lineItems: FeeLineItemResult[];
  subtotal: number;
  discountAmount: number;
  latePenaltyAmount: number;
  waiverAmount: number;
  totalAmount: number;
  currency: string;
  isEarlyBirdApplied: boolean;
  isLatePenaltyApplied: boolean;
}

export class FeeCalculator {
  /**
   * Pure calculation engine for student fees, optional add-ons, early-bird discounts, and late penalties.
   */
  static evaluate(params: {
    items: FeeItemDto[];
    currency?: string;
    targetAudience?: string;
    dueDate?: Date | string | null;
    lateFeePercentage?: number | null;
    lateFeeGraceDays?: number | null;
    earlyBirdDiscountPercentage?: number | null;
    earlyBirdCutoffDate?: Date | string | null;
    selectedOptionalCodes?: string[];
    isNewStudent?: boolean;
    isBoardingStudent?: boolean;
    paymentDate?: Date | string;
    waiverAmount?: number;
  }): FeeEvaluationResult {
    const {
      items = [],
      currency = 'USD',
      dueDate,
      lateFeePercentage = 0,
      lateFeeGraceDays = 0,
      earlyBirdDiscountPercentage = 0,
      earlyBirdCutoffDate,
      selectedOptionalCodes = [],
      isNewStudent = false,
      isBoardingStudent = false,
      paymentDate,
      waiverAmount = 0,
    } = params;

    const selectedSet = new Set(selectedOptionalCodes.map((c) => c.toUpperCase()));
    const lineItems: FeeLineItemResult[] = [];
    let subtotal = 0;

    for (const item of items) {
      const code = (item.code || item.name || 'ITEM').toUpperCase();
      const category = item.category || 'OTHER';
      let isIncluded = true;

      // Check optional selection
      if (item.isOptional) {
        isIncluded = selectedSet.has(code);
      }

      // Check new student category constraint
      if (category === 'ADMISSION' && !isNewStudent) {
        isIncluded = false;
      }

      // Check boarding category constraint
      if (category === 'BOARDING' && !isBoardingStudent) {
        isIncluded = false;
      }

      if (isIncluded) {
        subtotal += item.amount;
      }

      lineItems.push({
        name: item.name,
        code: item.code || code,
        category,
        amount: item.amount,
        isOptional: !!item.isOptional,
        isIncluded,
      });
    }

    subtotal = Number(subtotal.toFixed(2));

    // Evaluate early bird discount
    let discountAmount = 0;
    let isEarlyBirdApplied = false;
    const payDate = paymentDate ? new Date(paymentDate) : new Date();

    if (
      earlyBirdDiscountPercentage &&
      earlyBirdDiscountPercentage > 0 &&
      earlyBirdCutoffDate
    ) {
      const cutoff = new Date(earlyBirdCutoffDate);
      // Include whole cutoff day
      cutoff.setHours(23, 59, 59, 999);
      if (payDate <= cutoff) {
        discountAmount = Number(((subtotal * earlyBirdDiscountPercentage) / 100).toFixed(2));
        isEarlyBirdApplied = true;
      }
    }

    // Evaluate late fee penalty
    let latePenaltyAmount = 0;
    let isLatePenaltyApplied = false;

    if (lateFeePercentage && lateFeePercentage > 0 && dueDate) {
      const due = new Date(dueDate);
      const graceDays = lateFeeGraceDays || 0;
      const graceCutoff = new Date(due.getTime() + graceDays * 24 * 60 * 60 * 1000);
      graceCutoff.setHours(23, 59, 59, 999);

      if (payDate > graceCutoff) {
        latePenaltyAmount = Number(((subtotal * lateFeePercentage) / 100).toFixed(2));
        isLatePenaltyApplied = true;
      }
    }

    const validWaiver = Math.max(0, waiverAmount || 0);
    const totalAmount = Number(
      Math.max(0, subtotal - discountAmount - validWaiver + latePenaltyAmount).toFixed(2),
    );

    return {
      lineItems,
      subtotal,
      discountAmount,
      latePenaltyAmount,
      waiverAmount: validWaiver,
      totalAmount,
      currency,
      isEarlyBirdApplied,
      isLatePenaltyApplied,
    };
  }
}
