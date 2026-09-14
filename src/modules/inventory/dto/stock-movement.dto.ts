import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsIn,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecordStockMovementDto {
  @IsString()
  @IsNotEmpty()
  inventoryItemId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'RECEIPT_PURCHASE',
    'STOCK_IN',
    'STOCK_OUT_ISSUED',
    'CONSUMPTION',
    'DAMAGE_LOSS',
    'RETURN_TO_VENDOR',
    'AUDIT_ADJUSTMENT',
  ])
  type: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitCost?: number;

  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @IsString()
  @IsOptional()
  @IsIn(['STUDENT', 'STAFF', 'DEPARTMENT', 'CLASSROOM', 'LAB', 'OTHER'])
  issuedToType?: string;

  @IsString()
  @IsOptional()
  issuedToId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class IssueInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  inventoryItemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(['STUDENT', 'STAFF', 'DEPARTMENT', 'CLASSROOM', 'LAB'])
  issuedToType: string;

  @IsString()
  @IsNotEmpty()
  issuedToId: string;

  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class BatchStockAdjustmentItemDto {
  @IsString()
  @IsNotEmpty()
  inventoryItemId: string;

  @IsNumber()
  @Min(0)
  actualQuantity: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class BatchStockAdjustmentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchStockAdjustmentItemDto)
  adjustments: BatchStockAdjustmentItemDto[];

  @IsString()
  @IsOptional()
  auditReference?: string;
}
