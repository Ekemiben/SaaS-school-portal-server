import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
} from '../dto/inventory-item.dto.js';
import { InventoryItemFilterDto } from '../dto/inventory-filter.dto.js';

@Injectable()
export class InventoryItemService {
  private readonly logger = new Logger(InventoryItemService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createItem(
    tenantId: string,
    campusId: string | undefined,
    userId: string,
    dto: CreateInventoryItemDto,
  ) {
    const targetCampusId = dto.campusId || campusId || null;

    const existingSku = await this.prisma.inventoryItem.findFirst({
      where: {
        tenantId,
        sku: { equals: dto.sku, mode: 'insensitive' },
      },
    });

    if (existingSku) {
      throw new BadRequestException(
        `Inventory item with SKU '${dto.sku}' already exists`,
      );
    }

    const initialQty = dto.quantityOnHand || 0;

    const item = await this.prisma.inventoryItem.create({
      data: {
        tenantId,
        campusId: targetCampusId,
        name: dto.name,
        sku: dto.sku.toUpperCase(),
        category: dto.category || 'ACADEMIC',
        description: dto.description || null,
        unitOfMeasure: dto.unitOfMeasure || 'PIECES',
        unitCost: dto.unitCost || 0.0,
        unitSellingPrice: dto.unitSellingPrice || null,
        quantityOnHand: initialQty,
        reorderThreshold: dto.reorderThreshold !== undefined ? dto.reorderThreshold : 10,
        reorderQuantity: dto.reorderQuantity !== undefined ? dto.reorderQuantity : 50,
        storageLocation: dto.storageLocation || null,
        status: initialQty > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
      },
    });

    // If initial stock provided, log initial stock movement
    if (initialQty > 0) {
      await this.prisma.inventoryStockMovement.create({
        data: {
          tenantId,
          campusId: targetCampusId,
          inventoryItemId: item.id,
          type: 'STOCK_IN',
          quantity: initialQty,
          previousQty: 0,
          newQty: initialQty,
          unitCost: item.unitCost,
          referenceNumber: 'INITIAL_STOCK_RECORD',
          issuedToType: null,
          issuedToId: null,
          performedBy: userId,
          notes: 'Initial inventory item stock initialization',
        },
      });
    }

    return item;
  }

  async updateItem(tenantId: string, itemId: string, dto: UpdateInventoryItemDto) {
    const item = await this.getItemById(tenantId, itemId);

    const newQty = (dto as any).quantityOnHand !== undefined ? (dto as any).quantityOnHand : item.quantityOnHand;
    const resolvedStatus =
      dto.status ||
      (newQty <= 0 ? 'OUT_OF_STOCK' : 'ACTIVE');

    return this.prisma.inventoryItem.update({
      where: { id: itemId },
      data: {
        ...dto,
        status: resolvedStatus,
      },
    });
  }

  async getItemById(tenantId: string, itemId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, tenantId },
    });
    if (!item) {
      throw new NotFoundException(`Inventory item with ID '${itemId}' not found`);
    }
    return item;
  }

  async getItemBySku(tenantId: string, sku: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: {
        tenantId,
        sku: { equals: sku, mode: 'insensitive' },
      },
    });
    if (!item) {
      throw new NotFoundException(`Inventory item with SKU '${sku}' not found`);
    }
    return item;
  }

  async findAllItems(tenantId: string, filter?: InventoryItemFilterDto) {
    const where: any = { tenantId };

    if (filter?.campusId) {
      where.OR = [{ campusId: filter.campusId }, { campusId: null }];
    }
    if (filter?.category) {
      where.category = filter.category;
    }
    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.search) {
      const q = filter.search;
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { storageLocation: { contains: q, mode: 'insensitive' } },
      ];
    }

    let items = await this.prisma.inventoryItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (filter?.isLowStock === true || filter?.isLowStock === 'true') {
      items = items.filter((item) => item.quantityOnHand <= item.reorderThreshold);
    }

    return items;
  }

  async getLowStockItems(tenantId: string, campusId?: string) {
    return this.findAllItems(tenantId, { campusId, isLowStock: true });
  }

  async deleteItem(tenantId: string, itemId: string) {
    const item = await this.getItemById(tenantId, itemId);
    await this.prisma.inventoryItem.delete({
      where: { id: itemId },
    });
    return { success: true, message: `Inventory item ${item.sku} deleted successfully` };
  }
}
