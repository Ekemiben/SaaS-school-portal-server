import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsIn,
  IsDateString,
} from 'class-validator';

export class CreateMaintenanceLogDto {
  @IsString()
  @IsNotEmpty()
  assetId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'ROUTINE_SERVICE',
    'REPAIR',
    'CALIBRATION',
    'SAFETY_INSPECTION',
    'EMERGENCY_FIX',
  ])
  maintenanceType: string;

  @IsDateString()
  @IsOptional()
  serviceDate?: string;

  @IsString()
  @IsOptional()
  performedByVendorId?: string;

  @IsString()
  @IsOptional()
  technicianName?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  cost?: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  findings?: string;

  @IsDateString()
  @IsOptional()
  nextServiceDue?: string;

  @IsString()
  @IsOptional()
  @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED'])
  status?: string;
}

export class UpdateMaintenanceLogDto {
  @IsString()
  @IsOptional()
  @IsIn([
    'ROUTINE_SERVICE',
    'REPAIR',
    'CALIBRATION',
    'SAFETY_INSPECTION',
    'EMERGENCY_FIX',
  ])
  maintenanceType?: string;

  @IsDateString()
  @IsOptional()
  serviceDate?: string;

  @IsString()
  @IsOptional()
  performedByVendorId?: string;

  @IsString()
  @IsOptional()
  technicianName?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  cost?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  findings?: string;

  @IsDateString()
  @IsOptional()
  nextServiceDue?: string;

  @IsString()
  @IsOptional()
  @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED'])
  status?: string;
}
