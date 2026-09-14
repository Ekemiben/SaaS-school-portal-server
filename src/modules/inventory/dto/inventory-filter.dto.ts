import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class VendorFilterDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class InventoryItemFilterDto {
  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsOptional()
  isLowStock?: boolean | string;
}

export class StockMovementFilterDto {
  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  inventoryItemId?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  issuedToType?: string;

  @IsString()
  @IsOptional()
  issuedToId?: string;
}

export class SchoolAssetFilterDto {
  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  assignedToStaffId?: string;
}

export class PurchaseOrderFilterDto {
  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  vendorId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  orderNumber?: string;
}

export class InventoryAnalyticsFilterDto {
  @IsString()
  @IsOptional()
  campusId?: string;
}
