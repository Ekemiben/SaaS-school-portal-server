import { SiblingDiscountConfigDto, SiblingDiscountTierDto } from '../dto/bulk-invoice.dto.js';
import { FeeLineItemResult } from './fee-calculator.js';

export const DEFAULT_SIBLING_DISCOUNT_CONFIG: SiblingDiscountConfigDto = {
  isEnabled: true,
  applyToCategories: ['TUITION'],
  tiers: [
    { childIndex: 1, discountPercentage: 0, name: '1st Child (Full Tuition)' },
    { childIndex: 2, discountPercentage: 10, name: '2nd Child (10% Sibling Discount)' },
    { childIndex: 3, discountPercentage: 20, name: '3rd Child (20% Sibling Discount)' },
    { childIndex: 4, discountPercentage: 30, name: '4th+ Child (30% Sibling Discount)' },
  ],
};

export interface SiblingDiscountEvaluation {
  childIndex: number;
  totalSiblings: number;
  discountPercentage: number;
  eligibleSubtotal: number;
  discountAmount: number;
  tierName: string;
}

export class SiblingDiscountCalculator {
  /**
   * Computes the sibling discount percentage and amount for a specific student in a family group.
   */
  static evaluateSiblingDiscount(params: {
    studentIndex: number; // 0-based index in the sorted family group (0 = oldest/first)
    totalSiblings: number;
    lineItems: Array<{ amount: number; category?: string; isIncluded?: boolean }>;
    config?: SiblingDiscountConfigDto;
  }): SiblingDiscountEvaluation {
    const config = params.config || DEFAULT_SIBLING_DISCOUNT_CONFIG;
    const childIndex = params.studentIndex + 1; // 1-based index (1, 2, 3, 4...)

    if (!config.isEnabled || params.totalSiblings <= 1) {
      return {
        childIndex,
        totalSiblings: params.totalSiblings,
        discountPercentage: 0,
        eligibleSubtotal: 0,
        discountAmount: 0,
        tierName: 'Single Child / No Sibling Discount',
      };
    }

    // Match tier or use highest tier for 4th+ child
    const sortedTiers = [...config.tiers].sort((a, b) => a.childIndex - b.childIndex);
    let matchedTier: SiblingDiscountTierDto | undefined = sortedTiers.find((t) => t.childIndex === childIndex);

    if (!matchedTier && sortedTiers.length > 0) {
      // If childIndex exceeds defined tiers, use highest tier (e.g. 4th+ child)
      matchedTier = sortedTiers[sortedTiers.length - 1];
    }

    const discountPercentage = matchedTier ? matchedTier.discountPercentage : 0;
    const tierName = matchedTier ? matchedTier.name || `${discountPercentage}% Sibling Discount` : 'No Discount';

    // Calculate eligible base amount from applicable categories (default TUITION)
    const applicableCategories = new Set(
      (config.applyToCategories || ['TUITION']).map((c) => c.toUpperCase()),
    );

    let eligibleSubtotal = 0;
    for (const item of params.lineItems) {
      if (item.isIncluded === false) continue;
      const category = (item.category || 'OTHER').toUpperCase();
      if (applicableCategories.has(category) || applicableCategories.has('ALL')) {
        eligibleSubtotal += item.amount;
      }
    }

    const discountAmount = Number(((eligibleSubtotal * discountPercentage) / 100).toFixed(2));

    return {
      childIndex,
      totalSiblings: params.totalSiblings,
      discountPercentage,
      eligibleSubtotal: Number(eligibleSubtotal.toFixed(2)),
      discountAmount,
      tierName,
    };
  }
}
