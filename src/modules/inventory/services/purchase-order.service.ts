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
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: dto.vendorId, tenantId },
    });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID '${dto.vendorId}' not found`);
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Purchase order must contain at least one line item');
    }

    const targetCampusId = dto.campusId || campusId || null;
    const orderNumber = `PO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    let totalAmount = 0.0;
    const itemsData = [];

    for (const itemDto of dto.items) {
      if (itemDto.inventoryItemId) {
        const item = await this.prisma.inventoryItem.findFirst({
          where: { id: itemDto.inventoryItemId, tenantId },
        });
        if (!item) {
          throw new NotFoundException(`Inventory item with ID '${itemDto.inventoryItemId}' not found`);
        }
      }

      const lineTotal = itemDto.quantityOrdered * itemDto.unitPrice;
      totalAmount += lineTotal;

      itemsData.push({
        tenantId,
        inventoryItemId: itemDto.inventoryItemId || null,
        itemName: itemDto.itemName,
        description: itemDto.description || null,
        quantityOrdered: itemDto.quantityOrdered,
        quantityReceived: 0,
        unitPrice: itemDto.unitPrice,
        totalPrice: lineTotal,
        status: 'PENDING',
      });
    }

    return this.prisma.purchaseOrder.create({
      data: {
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
        items: {
          create: itemsData,
        },
      },
      include: {
        vendor: true,
        items: true,
      },
    });
  }

  async approvePurchaseOrder(tenantId: string, poId: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId },
    });
    if (!po) {
      throw new NotFoundException(`Purchase order with ID '${poId}' not found`);
    }

    if (po.status !== 'PENDING_APPROVAL' && po.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot approve purchase order with status '${po.status}'`);
    }

    return this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });
  }

  async orderPurchaseOrder(tenantId: string, poId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId },
    });
    if (!po) {
      throw new NotFoundException(`Purchase order with ID '${poId}' not found`);
    }

    if (po.status !== 'APPROVED') {
      throw new BadRequestException(`Purchase order must be APPROVED before placing order (Current: ${po.status})`);
    }

    return this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: 'ORDERED',
      },
    });
  }

  async receivePurchaseOrderItems(
    tenantId: string,
    poId: string,
    userId: string,
    dto: ReceivePurchaseOrderDto,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId },
      include: { items: true },
    });
    if (!po) {
      throw new NotFoundException(`Purchase order with ID '${poId}' not found`);
    }

    if (!['ORDERED', 'PARTIALLY_DELIVERED', 'APPROVED'].includes(po.status)) {
      throw new BadRequestException(`Cannot receive items for purchase order with status '${po.status}'`);
    }

    for (const recv of dto.items) {
      const lineItem = po.items.find((it) => it.id === recv.itemId);
      if (!lineItem) {
        throw new NotFoundException(`Line item '${recv.itemId}' does not belong to PO '${po.orderNumber}'`);
      }

      const newQtyReceived = lineItem.quantityReceived + recv.quantityReceived;
      const newStatus = newQtyReceived >= lineItem.quantityOrdered ? 'RECEIVED' : 'PARTIALLY_DELIVERED';

      await this.prisma.purchaseOrderItem.update({
        where: { id: lineItem.id },
        data: {
          quantityReceived: newQtyReceived,
          status: newStatus,
        },
      });

      // Auto-replenish stock if inventory item linked
      if (lineItem.inventoryItemId) {
        const invItem = await this.prisma.inventoryItem.findFirst({
          where: { id: lineItem.inventoryItemId, tenantId },
        });
        if (invItem) {
          const prevQty = invItem.quantityOnHand;
          const newQty = prevQty + recv.quantityReceived;

          await this.prisma.inventoryItem.update({
            where: { id: invItem.id },
            data: {
              quantityOnHand: newQty,
              status: 'ACTIVE',
              unitCost: lineItem.unitPrice,
            },
          });

          await this.prisma.inventoryStockMovement.create({
            data: {
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
            },
          });
        }
      }
    }

    const updatedItems = await this.prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId: poId, tenantId },
    });

    const allReceived = updatedItems.every((it) => it.quantityReceived >= it.quantityOrdered);
    const anyReceived = updatedItems.some((it) => it.quantityReceived > 0);

    const finalStatus = allReceived ? 'RECEIVED' : (anyReceived ? 'PARTIALLY_DELIVERED' : po.status);

    await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: finalStatus,
        actualDeliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : new Date(),
        ...(dto.deliveryNotes ? { deliveryNotes: dto.deliveryNotes } : {}),
      },
    });

    return this.getPurchaseOrderById(tenantId, poId);
  }

  async getPurchaseOrderById(tenantId: string, poId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId },
      include: {
        vendor: true,
        items: true,
      },
    });
    if (!po) {
      throw new NotFoundException(`Purchase order with ID '${poId}' not found`);
    }

    return po;
  }

  async findAllPurchaseOrders(tenantId: string, filter?: PurchaseOrderFilterDto) {
    const where: any = { tenantId };

    if (filter?.campusId) {
      where.OR = [{ campusId: filter.campusId }, { campusId: null }];
    }
    if (filter?.vendorId) {
      where.vendorId = filter.vendorId;
    }
    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.orderNumber) {
      where.orderNumber = { contains: filter.orderNumber, mode: 'insensitive' };
    }

    return this.prisma.purchaseOrder.findMany({
      where,
      include: {
        vendor: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelPurchaseOrder(tenantId: string, poId: string, reason?: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId },
    });
    if (!po) {
      throw new NotFoundException(`Purchase order with ID '${poId}' not found`);
    }

    if (po.status === 'RECEIVED') {
      throw new BadRequestException('Cannot cancel an already received purchase order');
    }

    return this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: 'CANCELLED',
        notes: reason ? `${po.notes || ''} [Cancelled: ${reason}]` : po.notes,
      },
    });
  }
}
