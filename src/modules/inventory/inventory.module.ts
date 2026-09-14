import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';

// Services
import { VendorService } from './services/vendor.service.js';
import { InventoryItemService } from './services/inventory-item.service.js';
import { StockMovementService } from './services/stock-movement.service.js';
import { SchoolAssetService } from './services/school-asset.service.js';
import { AssetDepreciationService } from './services/asset-depreciation.service.js';
import { AssetMaintenanceService } from './services/asset-maintenance.service.js';
import { PurchaseOrderService } from './services/purchase-order.service.js';
import { InventoryAnalyticsService } from './services/inventory-analytics.service.js';

// Controllers
import { VendorController } from './controllers/vendor.controller.js';
import { InventoryController } from './controllers/inventory.controller.js';
import { SchoolAssetController } from './controllers/school-asset.controller.js';
import { PurchaseOrderController } from './controllers/purchase-order.controller.js';
import { InventoryAnalyticsController } from './controllers/inventory-analytics.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    VendorController,
    InventoryController,
    SchoolAssetController,
    PurchaseOrderController,
    InventoryAnalyticsController,
  ],
  providers: [
    VendorService,
    InventoryItemService,
    StockMovementService,
    SchoolAssetService,
    AssetDepreciationService,
    AssetMaintenanceService,
    PurchaseOrderService,
    InventoryAnalyticsService,
  ],
  exports: [
    VendorService,
    InventoryItemService,
    StockMovementService,
    SchoolAssetService,
    AssetDepreciationService,
    AssetMaintenanceService,
    PurchaseOrderService,
    InventoryAnalyticsService,
  ],
})
export class InventoryModule {}
