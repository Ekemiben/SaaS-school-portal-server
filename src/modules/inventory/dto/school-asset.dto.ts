import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsIn,
  IsDateString,
} from 'class-validator';

export class CreateSchoolAssetDto {
  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  assetTag: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'LAB_EQUIPMENT',
    'ICT_HARDWARE',
    'FURNITURE',
    'VEHICLES',
    'SPORTS_FACILITIES',
    'BUILDING_INFRASTRUCTURE',
    'KITCHEN_CAFETERIA',
    'GENERAL',
  ])
  category?: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  manufacturer?: string;

  @IsDateString()
  @IsOptional()
  purchaseDate?: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  purchaseCost: number;

  @IsString()
  @IsOptional()
  vendorId?: string;

  @IsDateString()
  @IsOptional()
  warrantyExpiry?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  usefulLifeYears?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  salvageValue?: number;

  @IsString()
  @IsOptional()
  @IsIn(['STRAIGHT_LINE', 'REDUCING_BALANCE', 'NONE'])
  depreciationMethod?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  assignedToStaffId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED', 'DISPOSED'])
  condition?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateSchoolAssetDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'LAB_EQUIPMENT',
    'ICT_HARDWARE',
    'FURNITURE',
    'VEHICLES',
    'SPORTS_FACILITIES',
    'BUILDING_INFRASTRUCTURE',
    'KITCHEN_CAFETERIA',
    'GENERAL',
  ])
  category?: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  manufacturer?: string;

  @IsDateString()
  @IsOptional()
  warrantyExpiry?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  usefulLifeYears?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  salvageValue?: number;

  @IsString()
  @IsOptional()
  @IsIn(['STRAIGHT_LINE', 'REDUCING_BALANCE', 'NONE'])
  depreciationMethod?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  assignedToStaffId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED', 'DISPOSED'])
  condition?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'IN_SERVICE',
    'UNDER_MAINTENANCE',
    'RESERVED',
    'DECOMMISSIONED',
    'WRITTEN_OFF',
  ])
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
