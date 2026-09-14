import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class StartImpersonationDto {
  @IsString()
  @IsNotEmpty()
  targetTenantId: string;

  @IsString()
  @IsOptional()
  targetUserId?: string;

  @IsString()
  @IsNotEmpty()
  reason: string; // Mandatory justification e.g. "Ticket #4029 - Fix payroll issue"

  @IsNumber()
  @IsOptional()
  @Min(5)
  @Max(120)
  durationMinutes?: number; // Default 30 mins, max 2 hours
}

export class TerminateImpersonationDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class ImpersonationFilterDto {
  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsString()
  @IsOptional()
  superAdminUserId?: string;

  @IsOptional()
  isActive?: boolean | string;
}
