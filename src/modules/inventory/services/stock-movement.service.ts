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
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: dto.inventoryItemId, tenantId },
    });
    if (!item) {
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
    await this.prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        quantityOnHand: newQty,
        status: newQty > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
      },
    });

    // Record movement
    return this.prisma.inventoryStockMovement.create({
      data: {
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
      },
    });
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
      const item = await this.prisma.inventoryItem.findFirst({
        where: { id: adj.inventoryItemId, tenantId },
      });
      if (!item) {
        continue;
      }

      const prevQty = item.quantityOnHand;
      const actualQty = adj.actualQuantity;
      const diff = actualQty - prevQty;

      await this.prisma.inventoryItem.update({
        where: { id: item.id },
        data: {
          quantityOnHand: actualQty,
          status: actualQty > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
        },
      });

      const movement = await this.prisma.inventoryStockMovement.create({
        data: {
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
        },
      });

      results.push(movement);
    }

    return results;
  }

  async findMovements(tenantId: string, filter?: StockMovementFilterDto) {
    const where: any = { tenantId };

    if (filter?.campusId) {
      where.campusId = filter.campusId;
    }
    if (filter?.inventoryItemId) {
      where.inventoryItemId = filter.inventoryItemId;
    }
    if (filter?.type) {
      where.type = filter.type;
    }
    if (filter?.issuedToType) {
      where.issuedToType = filter.issuedToType;
    }
    if (filter?.issuedToId) {
      where.issuedToId = filter.issuedToId;
    }

    return this.prisma.inventoryStockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
