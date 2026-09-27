import {
  IsString,
  IsOptional,
  IsIn,
  IsBoolean,
  IsObject,
} from 'class-validator';

export class PlatformTenantFilterDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  plan?: string;
}

export class UpdateTenantStatusDto {
  @IsString()
  @IsIn(['ACTIVE', 'TRIAL', 'SUSPENDED', 'ARCHIVED', 'DELETED'])
  status: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class UpdateTenantPlanDto {
  @IsString()
  @IsIn(['free_trial', 'starter', 'growth', 'enterprise', 'pro'])
  plan: string;

  @IsObject()
  @IsOptional()
  features?: Record<string, boolean>;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class TenantDangerActionDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class DeleteTenantDangerDto {
  @IsString()
  confirmationSchoolName: string;

  @IsString()
  superAdminPassword: string;

  @IsBoolean()
  confirmationCheckbox: boolean;

  @IsString()
  @IsOptional()
  reason?: string;
}

