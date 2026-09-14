import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';

export class CalculateDepreciationDto {
  @IsString()
  @IsNotEmpty()
  financialYear: string;

  @IsString()
  @IsNotEmpty()
  period: string; // e.g. "FY2026-ANNUAL", "FY2026-Q1"

  @IsString()
  @IsOptional()
  campusId?: string;

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
  notes?: string;
}

export class AssetDepreciationOverrideDto {
  @IsString()
  @IsNotEmpty()
  assetId: string;

  @IsString()
  @IsNotEmpty()
  financialYear: string;

  @IsString()
  @IsNotEmpty()
  period: string;

  @IsNumber()
  @Min(0)
  depreciationAmount: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
