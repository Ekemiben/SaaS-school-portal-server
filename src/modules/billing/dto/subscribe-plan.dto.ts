import { IsString, IsEnum, IsOptional } from 'class-validator';

export class SubscribePlanDto {
  @IsEnum(['free_trial', 'starter', 'growth', 'enterprise', 'pro'])
  planTier!: string;

  @IsEnum(['MONTHLY', 'ANNUALLY', 'monthly', 'annually'])
  billingCycle!: string;

  @IsString()
  @IsOptional()
  paymentMethodId?: string;
}

export class CancelSubscriptionDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
