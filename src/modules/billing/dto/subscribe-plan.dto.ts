import { IsString, IsEnum, IsOptional } from 'class-validator';

export class SubscribePlanDto {
  @IsEnum(['starter', 'pro', 'enterprise'])
  planTier!: 'starter' | 'pro' | 'enterprise';

  @IsEnum(['MONTHLY', 'ANNUALLY'])
  billingCycle!: 'MONTHLY' | 'ANNUALLY';

  @IsString()
  @IsOptional()
  paymentMethodId?: string;
}
