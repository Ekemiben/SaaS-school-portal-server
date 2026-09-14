import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';

export class CreateInventoryItemDto {
  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'ACADEMIC',
    'UNIFORMS',
    'TEXTBOOKS',
    'LAB_EQUIPMENT',
    'STATIONERY',
    'CLEANING_SUPPLIES',
    'FIRST_AID',
    'SPORTS',
    'MAINTENANCE',
  ])
  category?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(['PIECES', 'BOXES', 'SETS', 'KG', 'LITERS', 'PACKS', 'PAIRS', 'UNITS'])
  unitOfMeasure?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitSellingPrice?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  quantityOnHand?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  reorderThreshold?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  reorderQuantity?: number;

  @IsString()
  @IsOptional()
  storageLocation?: string;
}

export class UpdateInventoryItemDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'ACADEMIC',
    'UNIFORMS',
    'TEXTBOOKS',
    'LAB_EQUIPMENT',
    'STATIONERY',
    'CLEANING_SUPPLIES',
    'FIRST_AID',
    'SPORTS',
    'MAINTENANCE',
  ])
  category?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(['PIECES', 'BOXES', 'SETS', 'KG', 'LITERS', 'PACKS', 'PAIRS', 'UNITS'])
  unitOfMeasure?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitSellingPrice?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  reorderThreshold?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  reorderQuantity?: number;

  @IsString()
  @IsOptional()
  storageLocation?: string;

  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'DISCONTINUED', 'OUT_OF_STOCK'])
  status?: string;
}
