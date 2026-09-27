import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, Min, IsArray } from 'class-validator';

export class PlatformSubscriptionFilterDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  planTier?: string;

  @IsString()
  @IsOptional()
  billingCycle?: string;

  @IsString()
  @IsOptional()
  search?: string;
}

export class UpdatePlanConfigDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  termlyPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  annualPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  yearlyDiscountPercent?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxStudents?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxCampuses?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxStaff?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  storageLimitMb?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  features?: string[];

  @IsString()
  @IsOptional()
  reason?: string;
}

export class GrantIncentiveDto {
  @IsString()
  @IsNotEmpty()
  featureKey: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  durationDays?: number;

  @IsString()
  @IsOptional()
  expiresAt?: string;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class TenantActionReasonDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
