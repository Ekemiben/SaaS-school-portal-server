import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
} from '../dto/purchase-order.dto.js';
import { PurchaseOrderFilterDto } from '../dto/inventory-filter.dto.js';

@Injectable()
export class PurchaseOrderService {
  private readonly logger = new Logger(PurchaseOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createPurchaseOrder(
    tenantId: string,
    campusId: string | undefined,
    userId: string,
    dto: CreatePurchaseOrderDto,
  ) {
    const vendor = this.prisma.memoryStore.vendors.get(dto.vendorId);
    if (!vendor || vendor.tenantId !== tenantId) {
      throw new NotFoundException(`Vendor with ID '${dto.vendorId}' not found`);
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Purchase order must contain at least one line item');
    }

    const targetCampusId = dto.campusId || campusId || null;
    const poId = `po_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orderNumber = `PO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    let totalAmount = 0.0;
    const createdItems = [];

    for (const itemDto of dto.items) {
      if (itemDto.inventoryItemId) {
        const item = this.prisma.memoryStore.inventoryItems.get(itemDto.inventoryItemId);
        if (!item || item.tenantId !== tenantId) {
          throw new NotFoundException(`Inventory item with ID '${itemDto.inventoryItemId}' not found`);
        }
      }

      const itemId = `poi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const lineTotal = itemDto.quantityOrdered * itemDto.unitPrice;
      totalAmount += lineTotal;

      const poItem = {
        id: itemId,
        tenantId,
        purchaseOrderId: poId,
        inventoryItemId: itemDto.inventoryItemId || null,
        itemName: itemDto.itemName,
        description: itemDto.description || null,
        quantityOrdered: itemDto.quantityOrdered,
        quantityReceived: 0,
        unitPrice: itemDto.unitPrice,
        totalPrice: lineTotal,
        status: 'PENDING',
      };

      this.prisma.memoryStore.purchaseOrderItems.set(itemId, poItem);
      createdItems.push(poItem);
    }

    const purchaseOrder = {
      id: poId,
      tenantId,
      campusId: targetCampusId,
      orderNumber,
      vendorId: dto.vendorId,
      orderDate: new Date(),
      expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : null,
      actualDeliveryDate: null,
      totalAmount,
      currency: dto.currency || 'USD',
      status: 'PENDING_APPROVAL',
      approvedBy: null,
      approvedAt: null,
      deliveryNotes: null,
      notes: dto.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.purchaseOrders.set(poId, purchaseOrder);
    return { ...purchaseOrder, vendor, items: createdItems };
  }

  async approvePurchaseOrder(tenantId: string, poId: string, userId: string) {
    const po = this.prisma.memoryStore.purchaseOrders.get(poId);
    if (!po || po.tenantId !== tenantId) {
      throw new NotFoundException(`Purchase order with ID '${poId}' not found`);
    }

    if (po.status !== 'PENDING_APPROVAL' && po.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot approve purchase order with status '${po.status}'`);
    }

    po.status = 'APPROVED';
    po.approvedBy = userId;
    po.approvedAt = new Date();
    po.updatedAt = new Date();
    this.prisma.memoryStore.purchaseOrders.set(poId, po);

    return po;
  }

  async orderPurchaseOrder(tenantId: string, poId: string) {
    const po = this.prisma.memoryStore.purchaseOrders.get(poId);
    if (!po || po.tenantId !== tenantId) {
      throw new NotFoundException(`Purchase order with ID '${poId}' not found`);
    }

    if (po.status !== 'APPROVED') {
      throw new BadRequestException(`Purchase order must be APPROVED before placing order (Current: ${po.status})`);
    }

    po.status = 'ORDERED';
    po.updatedAt = new Date();
    this.prisma.memoryStore.purchaseOrders.set(poId, po);
    return po;
  }

  async receivePurchaseOrderItems(
    tenantId: string,
    poId: string,
    userId: string,
    dto: ReceivePurchaseOrderDto,
  ) {
    const po = this.prisma.memoryStore.purchaseOrders.get(poId);
    if (!po || po.tenantId !== tenantId) {
      throw new NotFoundException(`Purchase order with ID '${poId}' not found`);
    }

    if (!['ORDERED', 'PARTIALLY_DELIVERED', 'APPROVED'].includes(po.status)) {
      throw new BadRequestException(`Cannot receive items for purchase order with status '${po.status}'`);
    }

    const items = Array.from(this.prisma.memoryStore.purchaseOrderItems.values()).filter(
      (poi: any) => poi.purchaseOrderId === poId && poi.tenantId === tenantId,
    );

    for (const recv of dto.items) {
      const lineItem = items.find((it: any) => it.id === recv.itemId);
      if (!lineItem) {
        throw new NotFoundException(`Line item '${recv.itemId}' does not belong to PO '${po.orderNumber}'`);
      }

      lineItem.quantityReceived += recv.quantityReceived;
      if (lineItem.quantityReceived >= lineItem.quantityOrdered) {
        lineItem.status = 'RECEIVED';
      } else {
        lineItem.status = 'PARTIALLY_DELIVERED';
      }
      this.prisma.memoryStore.purchaseOrderItems.set(lineItem.id, lineItem);

      // Auto-replenish stock if inventory item linked
      if (lineItem.inventoryItemId) {
        const invItem = this.prisma.memoryStore.inventoryItems.get(lineItem.inventoryItemId);
        if (invItem && invItem.tenantId === tenantId) {
          const prevQty = invItem.quantityOnHand;
          const newQty = prevQty + recv.quantityReceived;
          invItem.quantityOnHand = newQty;
          invItem.status = 'ACTIVE';
          invItem.unitCost = lineItem.unitPrice; // update cost
          invItem.updatedAt = new Date();
          this.prisma.memoryStore.inventoryItems.set(invItem.id, invItem);

          const mvtId = `mvt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const movement = {
            id: mvtId,
            tenantId,
            campusId: po.campusId,
            inventoryItemId: invItem.id,
            type: 'RECEIPT_PURCHASE',
            quantity: recv.quantityReceived,
            previousQty: prevQty,
            newQty,
            unitCost: lineItem.unitPrice,
            referenceNumber: po.orderNumber,
            issuedToType: null,
            issuedToId: null,
            performedBy: userId,
            notes: recv.notes || `Stock received from Purchase Order ${po.orderNumber}`,
            createdAt: new Date(),
          };
          this.prisma.memoryStore.inventoryStockMovements.set(mvtId, movement);
        }
      }
    }

    const allReceived = items.every((it: any) => it.quantityReceived >= it.quantityOrdered);
    const anyReceived = items.some((it: any) => it.quantityReceived > 0);

    po.status = allReceived ? 'RECEIVED' : (anyReceived ? 'PARTIALLY_DELIVERED' : po.status);
    po.actualDeliveryDate = dto.deliveryDate ? new Date(dto.deliveryDate) : new Date();
    if (dto.deliveryNotes) {
      po.deliveryNotes = dto.deliveryNotes;
    }
    po.updatedAt = new Date();
    this.prisma.memoryStore.purchaseOrders.set(poId, po);

    return this.getPurchaseOrderById(tenantId, poId);
  }

  async getPurchaseOrderById(tenantId: string, poId: string) {
    const po = this.prisma.memoryStore.purchaseOrders.get(poId);
    if (!po || po.tenantId !== tenantId) {
      throw new NotFoundException(`Purchase order with ID '${poId}' not found`);
    }

    const vendor = this.prisma.memoryStore.vendors.get(po.vendorId) || null;
    const items = Array.from(this.prisma.memoryStore.purchaseOrderItems.values()).filter(
      (poi: any) => poi.purchaseOrderId === poId && poi.tenantId === tenantId,
    );

    return {
      ...po,
      vendor,
      items,
    };
  }

  async findAllPurchaseOrders(tenantId: string, filter?: PurchaseOrderFilterDto) {
    let list = Array.from(this.prisma.memoryStore.purchaseOrders.values()).filter(
      (po: any) => po.tenantId === tenantId,
    );

    if (filter?.campusId) {
      list = list.filter((po: any) => po.campusId === filter.campusId || po.campusId === null);
    }
    if (filter?.vendorId) {
      list = list.filter((po: any) => po.vendorId === filter.vendorId);
    }
    if (filter?.status) {
      list = list.filter((po: any) => po.status === filter.status);
    }
    if (filter?.orderNumber) {
      list = list.filter((po: any) => po.orderNumber.toLowerCase().includes(filter.orderNumber!.toLowerCase()));
    }

    return list
      .map((po: any) => ({
        ...po,
        vendor: this.prisma.memoryStore.vendors.get(po.vendorId) || null,
      }))
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async cancelPurchaseOrder(tenantId: string, poId: string, reason?: string) {
    const po = this.prisma.memoryStore.purchaseOrders.get(poId);
    if (!po || po.tenantId !== tenantId) {
      throw new NotFoundException(`Purchase order with ID '${poId}' not found`);
    }

    if (po.status === 'RECEIVED') {
      throw new BadRequestException('Cannot cancel an already received purchase order');
    }

    po.status = 'CANCELLED';
    po.notes = reason ? `${po.notes || ''} [Cancelled: ${reason}]` : po.notes;
    po.updatedAt = new Date();
    this.prisma.memoryStore.purchaseOrders.set(poId, po);

    return po;
  }
}
