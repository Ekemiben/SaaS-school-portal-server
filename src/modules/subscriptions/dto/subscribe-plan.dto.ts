import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
} from 'class-validator';

export class SubscribePlanDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['free_trial', 'starter', 'growth', 'enterprise', 'pro'])
  planTier: string;

  @IsString()
  @IsOptional()
  @IsIn(['MONTHLY', 'ANNUALLY', 'monthly', 'annually'])
  billingCycle?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;
}

export class CancelSubscriptionDto {
  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  feedback?: string;
}
