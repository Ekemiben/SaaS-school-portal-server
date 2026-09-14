import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  RecordStockMovementDto,
  IssueInventoryItemDto,
  BatchStockAdjustmentDto,
} from '../dto/stock-movement.dto.js';
import { StockMovementFilterDto } from '../dto/inventory-filter.dto.js';

@Injectable()
export class StockMovementService {
  private readonly logger = new Logger(StockMovementService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordMovement(
    tenantId: string,
    campusId: string | undefined,
    userId: string,
    dto: RecordStockMovementDto,
  ) {
    const item = this.prisma.memoryStore.inventoryItems.get(dto.inventoryItemId);
    if (!item || item.tenantId !== tenantId) {
      throw new NotFoundException(`Inventory item with ID '${dto.inventoryItemId}' not found`);
    }

    const isAddition = ['RECEIPT_PURCHASE', 'STOCK_IN'].includes(dto.type);
    const isSubtraction = [
      'STOCK_OUT_ISSUED',
      'CONSUMPTION',
      'DAMAGE_LOSS',
      'RETURN_TO_VENDOR',
    ].includes(dto.type);

    let previousQty = item.quantityOnHand;
    let newQty = previousQty;

    if (isAddition) {
      newQty = previousQty + dto.quantity;
    } else if (isSubtraction) {
      if (previousQty < dto.quantity) {
        throw new BadRequestException(
          `Insufficient stock for item '${item.name}' (${item.sku}). Available: ${previousQty}, Requested: ${dto.quantity}`,
        );
      }
      newQty = previousQty - dto.quantity;
    } else if (dto.type === 'AUDIT_ADJUSTMENT') {
      newQty = dto.quantity; // Explicit new level
    }

    // Update item stock
    item.quantityOnHand = newQty;
    item.status = newQty > 0 ? 'ACTIVE' : 'OUT_OF_STOCK';
    item.updatedAt = new Date();
    this.prisma.memoryStore.inventoryItems.set(item.id, item);

    // Record movement
    const movementId = `mvt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const movement = {
      id: movementId,
      tenantId,
      campusId: item.campusId || campusId || null,
      inventoryItemId: item.id,
      type: dto.type,
      quantity: dto.quantity,
      previousQty,
      newQty,
      unitCost: dto.unitCost !== undefined ? dto.unitCost : item.unitCost,
      referenceNumber: dto.referenceNumber || null,
      issuedToType: dto.issuedToType || null,
      issuedToId: dto.issuedToId || null,
      performedBy: userId,
      notes: dto.notes || null,
      createdAt: new Date(),
    };

    this.prisma.memoryStore.inventoryStockMovements.set(movementId, movement);
    return movement;
  }

  async issueItem(
    tenantId: string,
    campusId: string | undefined,
    userId: string,
    dto: IssueInventoryItemDto,
  ) {
    return this.recordMovement(tenantId, campusId, userId, {
      inventoryItemId: dto.inventoryItemId,
      type: 'STOCK_OUT_ISSUED',
      quantity: dto.quantity,
      referenceNumber: dto.referenceNumber || `ISSUE-${Date.now()}`,
      issuedToType: dto.issuedToType,
      issuedToId: dto.issuedToId,
      notes: dto.notes,
    });
  }

  async batchStockAdjustment(
    tenantId: string,
    campusId: string | undefined,
    userId: string,
    dto: BatchStockAdjustmentDto,
  ) {
    const results = [];

    for (const adj of dto.adjustments) {
      const item = this.prisma.memoryStore.inventoryItems.get(adj.inventoryItemId);
      if (!item || item.tenantId !== tenantId) {
        continue;
      }

      const prevQty = item.quantityOnHand;
      const actualQty = adj.actualQuantity;
      const diff = actualQty - prevQty;

      item.quantityOnHand = actualQty;
      item.status = actualQty > 0 ? 'ACTIVE' : 'OUT_OF_STOCK';
      item.updatedAt = new Date();
      this.prisma.memoryStore.inventoryItems.set(item.id, item);

      const movementId = `mvt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const movement = {
        id: movementId,
        tenantId,
        campusId: item.campusId || campusId || null,
        inventoryItemId: item.id,
        type: 'AUDIT_ADJUSTMENT',
        quantity: Math.abs(diff),
        previousQty: prevQty,
        newQty: actualQty,
        unitCost: item.unitCost,
        referenceNumber: dto.auditReference || `AUDIT-${Date.now()}`,
        issuedToType: null,
        issuedToId: null,
        performedBy: userId,
        notes: adj.notes || `Stock audit adjustment (Variance: ${diff > 0 ? '+' : ''}${diff})`,
        createdAt: new Date(),
      };

      this.prisma.memoryStore.inventoryStockMovements.set(movementId, movement);
      results.push(movement);
    }

    return results;
  }

  async findMovements(tenantId: string, filter?: StockMovementFilterDto) {
    let list = Array.from(this.prisma.memoryStore.inventoryStockMovements.values()).filter(
      (m: any) => m.tenantId === tenantId,
    );

    if (filter?.campusId) {
      list = list.filter((m: any) => m.campusId === filter.campusId);
    }
    if (filter?.inventoryItemId) {
      list = list.filter((m: any) => m.inventoryItemId === filter.inventoryItemId);
    }
    if (filter?.type) {
      list = list.filter((m: any) => m.type === filter.type);
    }
    if (filter?.issuedToType) {
      list = list.filter((m: any) => m.issuedToType === filter.issuedToType);
    }
    if (filter?.issuedToId) {
      list = list.filter((m: any) => m.issuedToId === filter.issuedToId);
    }

    return list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
