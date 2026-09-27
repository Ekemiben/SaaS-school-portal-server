import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export enum PlanTierEnum {
  STARTER = 'STARTER',
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
  CUSTOM = 'CUSTOM',
}

export enum BillingCycleEnum {
  TERMLY = 'TERMLY',
  ANNUAL = 'ANNUAL',
}

export class PreviewPlanChangeDto {
  @IsString()
  @IsNotEmpty()
  targetTier: string;

  @IsString()
  @IsOptional()
  targetBillingCycle?: string;
}

export class UpgradeSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  targetTier: string;

  @IsString()
  @IsOptional()
  targetBillingCycle?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string; // 'PAYSTACK', 'BANK_TRANSFER', 'MANUAL', 'INVOICE'

  @IsString()
  @IsOptional()
  callbackUrl?: string;

  @IsBoolean()
  @IsOptional()
  immediate?: boolean; // defaults to true for upgrades
}

export class DowngradeSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  targetTier: string;

  @IsString()
  @IsOptional()
  targetBillingCycle?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsBoolean()
  @IsOptional()
  immediate?: boolean; // defaults to true or at cycle end
}

export class SuperAdminChangePlanDto {
  @IsString()
  @IsNotEmpty()
  targetTier: string;

  @IsString()
  @IsOptional()
  targetBillingCycle?: string;

  @IsString()
  @IsNotEmpty()
  reason: string; // Mandatory rationale for audit

  @IsBoolean()
  @IsOptional()
  bypassQuotaValidation?: boolean; // In emergency cases, platform admin can override quota validation

  @IsBoolean()
  @IsOptional()
  waiveCharges?: boolean; // If true, don't charge prorated difference
}
