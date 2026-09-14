import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { VendorService } from '../src/modules/inventory/services/vendor.service.js';
import { InventoryItemService } from '../src/modules/inventory/services/inventory-item.service.js';
import { PurchaseOrderService } from '../src/modules/inventory/services/purchase-order.service.js';
import { StockMovementService } from '../src/modules/inventory/services/stock-movement.service.js';
import { SystemPermissions } from '../src/common/constants/permissions.js';

describe('Procurement Workflow, Auto-Replenishment & Multi-Tenant Isolation', () => {
  let prisma: PrismaService;
  let vendorService: VendorService;
  let itemService: InventoryItemService;
  let poService: PurchaseOrderService;
  let movementService: StockMovementService;

  const tenantA = 'tenant_greenfield_100';
  const tenantB = 'tenant_cedar_heights_200';
  const campusA = 'campus_main_01';
  const userId = 'user_admin_001';

  beforeEach(() => {
    prisma = new PrismaService();
    vendorService = new VendorService(prisma);
    itemService = new InventoryItemService(prisma);
    poService = new PurchaseOrderService(prisma);
    movementService = new StockMovementService(prisma);
  });

  it('should process full purchase order lifecycle with automatic stock replenishment', async () => {
    // 1. Create vendor
    const vendor = await vendorService.createVendor(tenantA, {
      name: 'Premier School Supplies Ltd',
      code: 'PSS-LTD',
      category: 'STATIONERY',
      paymentTerms: 'NET_30',
    });

    // 2. Create inventory item with 0 stock
    const item = await itemService.createItem(tenantA, campusA, userId, {
      name: 'A4 Printing Paper 80GSM (Ream of 500)',
      sku: 'STN-PPR-A4-80',
      category: 'STATIONERY',
      unitOfMeasure: 'PACKS',
      unitCost: 5.0,
      quantityOnHand: 0,
      reorderThreshold: 20,
    });
    expect(item.quantityOnHand).toBe(0);
    expect(item.status).toBe('OUT_OF_STOCK');

    // 3. Create Purchase Order for 50 packs at $5.0 each
    const po = await poService.createPurchaseOrder(tenantA, campusA, userId, {
      vendorId: vendor.id,
      items: [
        {
          inventoryItemId: item.id,
          itemName: 'A4 Printing Paper 80GSM (Ream of 500)',
          quantityOrdered: 50,
          unitPrice: 5.0,
        },
      ],
      notes: 'Term 1 general examination paper supply',
    });

    expect(po.id).toBeDefined();
    expect(po.totalAmount).toBe(250.0);
    expect(po.status).toBe('PENDING_APPROVAL');

    // 4. Approve and Order PO
    await poService.approvePurchaseOrder(tenantA, po.id, userId);
    await poService.orderPurchaseOrder(tenantA, po.id);

    // 5. Receive delivery
    const receivedPO = await poService.receivePurchaseOrderItems(tenantA, po.id, userId, {
      items: [
        {
          itemId: po.items[0].id,
          quantityReceived: 50,
          notes: 'Delivered in full, all boxes intact',
        },
      ],
      deliveryNotes: 'Waybill #WB-99238',
    });

    expect(receivedPO.status).toBe('RECEIVED');
    expect(receivedPO.items[0].quantityReceived).toBe(50);
    expect(receivedPO.items[0].status).toBe('RECEIVED');

    // 6. Verify inventory item was automatically replenished
    const updatedItem = await itemService.getItemById(tenantA, item.id);
    expect(updatedItem.quantityOnHand).toBe(50);
    expect(updatedItem.status).toBe('ACTIVE');

    // 7. Verify stock movement was logged
    const movements = await movementService.findMovements(tenantA, {
      inventoryItemId: item.id,
      type: 'RECEIPT_PURCHASE',
    });
    expect(movements.length).toBe(1);
    expect(movements[0].quantity).toBe(50);
    expect(movements[0].referenceNumber).toBe(po.orderNumber);
  });

  it('should enforce strict multi-tenant isolation across vendors, items and purchase orders', async () => {
    // 1. Create vendor and item for Tenant A
    const vendorA = await vendorService.createVendor(tenantA, {
      name: 'Tenant A Uniform Tailors',
      code: 'TAU-01',
      category: 'UNIFORMS',
    });

    const itemA = await itemService.createItem(tenantA, campusA, userId, {
      name: 'Tenant A School Tie',
      sku: 'TIE-TA-01',
      category: 'UNIFORMS',
      quantityOnHand: 10,
    });

    // 2. Tenant B should NOT be able to view or manipulate Tenant A vendor
    await expect(vendorService.getVendorById(tenantB, vendorA.id)).rejects.toThrow(/not found/i);

    // 3. Tenant B should NOT be able to view or manipulate Tenant A inventory item
    await expect(itemService.getItemById(tenantB, itemA.id)).rejects.toThrow(/not found/i);

    // 4. Tenant B should NOT be able to create a PO referencing Tenant A's vendor
    await expect(
      poService.createPurchaseOrder(tenantB, undefined, userId, {
        vendorId: vendorA.id,
        items: [
          {
            itemName: 'Cross-Tenant Supply',
            quantityOrdered: 10,
            unitPrice: 5.0,
          },
        ],
      }),
    ).rejects.toThrow(/not found/i);

    // 5. Tenant B can use the same SKU without colliding with Tenant A
    const itemB = await itemService.createItem(tenantB, undefined, userId, {
      name: 'Tenant B School Tie',
      sku: 'TIE-TA-01', // same SKU as Tenant A
      category: 'UNIFORMS',
      quantityOnHand: 20,
    });
    expect(itemB.id).toBeDefined();
    expect(itemB.tenantId).toBe(tenantB);
  });

  it('should export all required system permissions for inventory, assets, and procurement', () => {
    expect(SystemPermissions.INVENTORY_VIEW).toBe('inventory.view');
    expect(SystemPermissions.INVENTORY_MANAGE).toBe('inventory.manage');
    expect(SystemPermissions.ASSETS_VIEW).toBe('assets.view');
    expect(SystemPermissions.ASSETS_MANAGE).toBe('assets.manage');
    expect(SystemPermissions.PROCUREMENT_VIEW).toBe('procurement.view');
    expect(SystemPermissions.PROCUREMENT_MANAGE).toBe('procurement.manage');
  });
});
