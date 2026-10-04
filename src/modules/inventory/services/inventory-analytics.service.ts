import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class InventoryAnalyticsService {
  private readonly logger = new Logger(InventoryAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getInventorySummary(tenantId: string, campusId?: string) {
    const itemWhere: any = { tenantId };
    const assetWhere: any = { tenantId };
    const poWhere: any = { tenantId };
    const maintWhere: any = { tenantId };
    const vendorWhere: any = { tenantId };

    if (campusId) {
      itemWhere.OR = [{ campusId }, { campusId: null }];
      assetWhere.OR = [{ campusId }, { campusId: null }];
      poWhere.OR = [{ campusId }, { campusId: null }];
    }

    const [items, assets, pos, maintenance, vendorCount] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where: itemWhere }),
      this.prisma.schoolAsset.findMany({ where: assetWhere }),
      this.prisma.purchaseOrder.findMany({ where: poWhere }),
      this.prisma.assetMaintenanceLog.findMany({ where: maintWhere }),
      this.prisma.vendor.count({ where: vendorWhere }),
    ]);

    // Inventory items metrics
    const totalItemTypes = items.length;
    let totalStockUnits = 0;
    let totalStockValuation = 0.0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const stockByCategory: Record<string, { count: number; totalValuation: number }> = {};

    for (const item of items) {
      const qty = item.quantityOnHand || 0;
      const cost = item.unitCost || 0.0;
      const valuation = qty * cost;

      totalStockUnits += qty;
      totalStockValuation += valuation;

      if (qty <= 0) {
        outOfStockCount++;
      } else if (qty <= item.reorderThreshold) {
        lowStockCount++;
      }

      const cat = item.category || 'GENERAL';
      if (!stockByCategory[cat]) {
        stockByCategory[cat] = { count: 0, totalValuation: 0.0 };
      }
      stockByCategory[cat].count += 1;
      stockByCategory[cat].totalValuation += valuation;
    }

    // Fixed Assets metrics
    const totalAssets = assets.length;
    let totalAssetPurchaseCost = 0.0;
    let totalAssetCurrentBookValue = 0.0;
    let totalAccumulatedDepreciation = 0.0;

    const assetsByCategory: Record<string, { count: number; bookValue: number }> = {};

    for (const asset of assets) {
      totalAssetPurchaseCost += asset.purchaseCost || 0.0;
      totalAssetCurrentBookValue += asset.currentBookValue || 0.0;
      totalAccumulatedDepreciation += asset.accumulatedDepreciation || 0.0;

      const cat = asset.category || 'GENERAL';
      if (!assetsByCategory[cat]) {
        assetsByCategory[cat] = { count: 0, bookValue: 0.0 };
      }
      assetsByCategory[cat].count += 1;
      assetsByCategory[cat].bookValue += asset.currentBookValue || 0.0;
    }

    // Maintenance metrics
    const totalMaintenanceSpend = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0);

    // Procurement metrics
    const totalProcurementSpend = pos
      .filter((p) => ['APPROVED', 'ORDERED', 'PARTIALLY_DELIVERED', 'RECEIVED'].includes(p.status))
      .reduce((sum, p) => sum + (p.totalAmount || 0), 0);

    return {
      inventory: {
        totalItemTypes,
        totalStockUnits,
        totalStockValuation: Math.round(totalStockValuation * 100) / 100,
        lowStockCount,
        outOfStockCount,
        stockByCategory,
      },
      assets: {
        totalAssets,
        totalPurchaseCost: Math.round(totalAssetPurchaseCost * 100) / 100,
        totalCurrentBookValue: Math.round(totalAssetCurrentBookValue * 100) / 100,
        totalAccumulatedDepreciation: Math.round(totalAccumulatedDepreciation * 100) / 100,
        assetsByCategory,
      },
      maintenance: {
        totalLogs: maintenance.length,
        totalSpend: Math.round(totalMaintenanceSpend * 100) / 100,
      },
      procurement: {
        totalVendors: vendorCount,
        totalPurchaseOrders: pos.length,
        totalSpend: Math.round(totalProcurementSpend * 100) / 100,
      },
    };
  }
}
