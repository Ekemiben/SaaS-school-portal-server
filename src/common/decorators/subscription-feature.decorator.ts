import { SetMetadata } from '@nestjs/common';

export const SUBSCRIPTION_FEATURE_KEY = 'subscription_feature';

/**
 * Enforces that the tenant's active subscription tier (or active promotional incentives)
 * includes the specified featureKey before allowing endpoint execution.
 *
 * Example:
 *   @RequireSubscriptionFeature('EXAMINATIONS_RESULTS')
 *   @Get('examinations')
 *   listExams(...)
 */
export const RequireSubscriptionFeature = (featureKey: string) =>
  SetMetadata(SUBSCRIPTION_FEATURE_KEY, featureKey);
