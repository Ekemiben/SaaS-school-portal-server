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

    const existingSku = Array.from(
      this.prisma.memoryStore.inventoryItems.values(),
    ).find(
      (item: any) =>
        item.tenantId === tenantId &&
        item.sku.toLowerCase() === dto.sku.toLowerCase(),
    );

    if (existingSku) {
      throw new BadRequestException(
        `Inventory item with SKU '${dto.sku}' already exists`,
      );
    }

    const id = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const initialQty = dto.quantityOnHand || 0;

    const item = {
      id,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.inventoryItems.set(id, item);

    // If initial stock provided, log initial stock movement
    if (initialQty > 0) {
      const movementId = `mvt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const movement = {
        id: movementId,
        tenantId,
        campusId: targetCampusId,
        inventoryItemId: id,
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
        createdAt: new Date(),
      };
      this.prisma.memoryStore.inventoryStockMovements.set(movementId, movement);
    }

    return item;
  }

  async updateItem(tenantId: string, itemId: string, dto: UpdateInventoryItemDto) {
    const item = await this.getItemById(tenantId, itemId);

    const updated = {
      ...item,
      ...dto,
      status:
        dto.status ||
        (item.quantityOnHand <= 0 ? 'OUT_OF_STOCK' : 'ACTIVE'),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.inventoryItems.set(itemId, updated);
    return updated;
  }

  async getItemById(tenantId: string, itemId: string) {
    const item = this.prisma.memoryStore.inventoryItems.get(itemId);
    if (!item || item.tenantId !== tenantId) {
      throw new NotFoundException(`Inventory item with ID '${itemId}' not found`);
    }
    return item;
  }

  async getItemBySku(tenantId: string, sku: string) {
    const item = Array.from(
      this.prisma.memoryStore.inventoryItems.values(),
    ).find(
      (it: any) =>
        it.tenantId === tenantId &&
        it.sku.toLowerCase() === sku.toLowerCase(),
    );
    if (!item) {
      throw new NotFoundException(`Inventory item with SKU '${sku}' not found`);
    }
    return item;
  }

  async findAllItems(tenantId: string, filter?: InventoryItemFilterDto) {
    let list = Array.from(this.prisma.memoryStore.inventoryItems.values()).filter(
      (item: any) => item.tenantId === tenantId,
    );

    if (filter?.campusId) {
      list = list.filter((item: any) => item.campusId === filter.campusId || item.campusId === null);
    }
    if (filter?.category) {
      list = list.filter((item: any) => item.category === filter.category);
    }
    if (filter?.status) {
      list = list.filter((item: any) => item.status === filter.status);
    }
    if (filter?.isLowStock === true || filter?.isLowStock === 'true') {
      list = list.filter((item: any) => item.quantityOnHand <= item.reorderThreshold);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (item: any) =>
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          (item.storageLocation && item.storageLocation.toLowerCase().includes(q)),
      );
    }

    return list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getLowStockItems(tenantId: string, campusId?: string) {
    return this.findAllItems(tenantId, { campusId, isLowStock: true });
  }

  async deleteItem(tenantId: string, itemId: string) {
    const item = await this.getItemById(tenantId, itemId);
    this.prisma.memoryStore.inventoryItems.delete(itemId);
    return { success: true, message: `Inventory item ${item.sku} deleted successfully` };
  }
}
