import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { InventoryItemService } from '../src/modules/inventory/services/inventory-item.service.js';
import { StockMovementService } from '../src/modules/inventory/services/stock-movement.service.js';
import { InventoryAnalyticsService } from '../src/modules/inventory/services/inventory-analytics.service.js';

describe('Inventory Items & Stock Movements Workflow', () => {
  let prisma: PrismaService;
  let itemService: InventoryItemService;
  let movementService: StockMovementService;
  let analyticsService: InventoryAnalyticsService;

  const tenantId = 'tenant_greenfield_100';
  const campusId = 'campus_main_01';
  const userId = 'user_admin_001';

  beforeEach(() => {
    prisma = new PrismaService();
    itemService = new InventoryItemService(prisma);
    movementService = new StockMovementService(prisma);
    analyticsService = new InventoryAnalyticsService(prisma);
  });

  it('should catalog items, enforce SKU uniqueness, and identify low stock', async () => {
    // 1. Create uniform item with initial stock
    const uniform = await itemService.createItem(tenantId, campusId, userId, {
      name: 'School Blazer - Senior Navy (Size 38)',
      sku: 'BLZ-SNR-NAVY-38',
      category: 'UNIFORMS',
      unitOfMeasure: 'PIECES',
      unitCost: 45.0,
      unitSellingPrice: 65.0,
      quantityOnHand: 25,
      reorderThreshold: 10,
      reorderQuantity: 30,
      storageLocation: 'Store Room A / Rack 2',
    });

    expect(uniform.id).toBeDefined();
    expect(uniform.sku).toBe('BLZ-SNR-NAVY-38');
    expect(uniform.quantityOnHand).toBe(25);
    expect(uniform.status).toBe('ACTIVE');

    // Verify initial stock movement was automatically recorded
    const movements = await movementService.findMovements(tenantId, {
      inventoryItemId: uniform.id,
    });
    expect(movements.length).toBe(1);
    expect(movements[0].type).toBe('STOCK_IN');
    expect(movements[0].quantity).toBe(25);

    // 2. Duplicate SKU should be rejected
    await expect(
      itemService.createItem(tenantId, campusId, userId, {
        name: 'Another Blazer',
        sku: 'BLZ-SNR-NAVY-38',
        unitCost: 40.0,
      }),
    ).rejects.toThrow(/already exists/i);

    // 3. Create low stock lab supply
    const labChemical = await itemService.createItem(tenantId, campusId, userId, {
      name: 'Hydrochloric Acid 1M (500ml)',
      sku: 'LAB-CHEM-HCL-500',
      category: 'LAB_EQUIPMENT',
      unitOfMeasure: 'LITERS',
      unitCost: 15.0,
      quantityOnHand: 4, // below threshold 10
      reorderThreshold: 10,
    });

    const lowStockItems = await itemService.getLowStockItems(tenantId, campusId);
    expect(lowStockItems.some((i: any) => i.id === labChemical.id)).toBe(true);
  });

  it('should record stock issues, enforce stock limits, and track movement audit history', async () => {
    // 1. Create textbook item
    const textbook = await itemService.createItem(tenantId, campusId, userId, {
      name: 'Modern Biology 3rd Edition',
      sku: 'TB-BIO-G10-03',
      category: 'TEXTBOOKS',
      unitOfMeasure: 'PIECES',
      unitCost: 20.0,
      quantityOnHand: 15,
      reorderThreshold: 5,
    });

    // 2. Issue 5 textbooks to a student
    const issueMovement = await movementService.issueItem(tenantId, campusId, userId, {
      inventoryItemId: textbook.id,
      quantity: 5,
      issuedToType: 'STUDENT',
      issuedToId: 'std_john_doe_01',
      referenceNumber: 'ISSUE-TB-2026-001',
      notes: 'Term 1 curriculum issuance',
    });

    expect(issueMovement.newQty).toBe(10);
    const updatedBook = await itemService.getItemById(tenantId, textbook.id);
    expect(updatedBook.quantityOnHand).toBe(10);

    // 3. Attempting to issue more than remaining stock should fail
    await expect(
      movementService.issueItem(tenantId, campusId, userId, {
        inventoryItemId: textbook.id,
        quantity: 20, // only 10 available
        issuedToType: 'STUDENT',
        issuedToId: 'std_jane_02',
      }),
    ).rejects.toThrow(/insufficient stock/i);

    // 4. Record damage/loss
    const damageMovement = await movementService.recordMovement(tenantId, campusId, userId, {
      inventoryItemId: textbook.id,
      type: 'DAMAGE_LOSS',
      quantity: 2,
      notes: 'Water damaged in science storage',
    });

    expect(damageMovement.newQty).toBe(8);
    const finalBook = await itemService.getItemById(tenantId, textbook.id);
    expect(finalBook.quantityOnHand).toBe(8);
  });

  it('should process batch stock audit adjustments and calculate accurate valuation', async () => {
    const item1 = await itemService.createItem(tenantId, campusId, userId, {
      name: 'Graph Notebook 80 Pages',
      sku: 'STN-NB-GR-80',
      category: 'STATIONERY',
      unitCost: 2.0,
      quantityOnHand: 50,
    });

    const item2 = await itemService.createItem(tenantId, campusId, userId, {
      name: 'Whiteboard Marker Black',
      sku: 'STN-MRK-BLK',
      category: 'STATIONERY',
      unitCost: 1.5,
      quantityOnHand: 100,
    });

    // Run batch stock audit adjustment (e.g. physical count found 48 notebooks and 105 markers)
    const auditAdjustments = await movementService.batchStockAdjustment(tenantId, campusId, userId, {
      auditReference: 'AUDIT-TERM1-2026',
      adjustments: [
        { inventoryItemId: item1.id, actualQuantity: 48, notes: 'Physical count discrepancy' },
        { inventoryItemId: item2.id, actualQuantity: 105, notes: 'Found extra pack' },
      ],
    });

    expect(auditAdjustments.length).toBe(2);

    const updatedItem1 = await itemService.getItemById(tenantId, item1.id);
    const updatedItem2 = await itemService.getItemById(tenantId, item2.id);
    expect(updatedItem1.quantityOnHand).toBe(48);
    expect(updatedItem2.quantityOnHand).toBe(105);

    // Verify analytics valuation: (48 * 2) + (105 * 1.5) = 96 + 157.5 = 253.5
    const summary = await analyticsService.getInventorySummary(tenantId, campusId);
    expect(summary.inventory.totalStockUnits).toBeGreaterThanOrEqual(153);
    expect(summary.inventory.totalStockValuation).toBeGreaterThanOrEqual(253.5);
  });
});
