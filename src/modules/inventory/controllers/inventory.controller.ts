import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { InventoryItemService } from '../services/inventory-item.service.js';
import { StockMovementService } from '../services/stock-movement.service.js';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
} from '../dto/inventory-item.dto.js';
import {
  RecordStockMovementDto,
  IssueInventoryItemDto,
  BatchStockAdjustmentDto,
} from '../dto/stock-movement.dto.js';
import {
  InventoryItemFilterDto,
  StockMovementFilterDto,
} from '../dto/inventory-filter.dto.js';

@Controller('api/v1/inventory')
export class InventoryController {
  constructor(
    private readonly itemService: InventoryItemService,
    private readonly movementService: StockMovementService,
  ) {}

  @Post('items')
  @RequirePermissions(SystemPermissions.INVENTORY_MANAGE)
  createItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateInventoryItemDto,
  ) {
    return this.itemService.createItem(
      tenant.tenantId,
      tenant.campusIds?.[0],
      user?.id || 'system_user',
      dto,
    );
  }

  @Get('items')
  @RequirePermissions(SystemPermissions.INVENTORY_VIEW)
  findAllItems(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: InventoryItemFilterDto,
  ) {
    return this.itemService.findAllItems(tenant.tenantId, filter);
  }

  @Get('items/low-stock')
  @RequirePermissions(SystemPermissions.INVENTORY_VIEW)
  getLowStockItems(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.itemService.getLowStockItems(
      tenant.tenantId,
      campusId || tenant.campusIds?.[0],
    );
  }

  @Get('items/:id')
  @RequirePermissions(SystemPermissions.INVENTORY_VIEW)
  getItemById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.itemService.getItemById(tenant.tenantId, id);
  }

  @Patch('items/:id')
  @RequirePermissions(SystemPermissions.INVENTORY_MANAGE)
  updateItem(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.itemService.updateItem(tenant.tenantId, id, dto);
  }

  @Delete('items/:id')
  @RequirePermissions(SystemPermissions.INVENTORY_MANAGE)
  deleteItem(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.itemService.deleteItem(tenant.tenantId, id);
  }

  @Post('movements')
  @RequirePermissions(SystemPermissions.INVENTORY_MANAGE)
  recordMovement(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: RecordStockMovementDto,
  ) {
    return this.movementService.recordMovement(
      tenant.tenantId,
      tenant.campusIds?.[0],
      user?.id || 'system_user',
      dto,
    );
  }

  @Post('movements/issue')
  @RequirePermissions(SystemPermissions.INVENTORY_MANAGE)
  issueItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: IssueInventoryItemDto,
  ) {
    return this.movementService.issueItem(
      tenant.tenantId,
      tenant.campusIds?.[0],
      user?.id || 'system_user',
      dto,
    );
  }

  @Post('movements/batch-adjustment')
  @RequirePermissions(SystemPermissions.INVENTORY_MANAGE)
  batchStockAdjustment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: BatchStockAdjustmentDto,
  ) {
    return this.movementService.batchStockAdjustment(
      tenant.tenantId,
      tenant.campusIds?.[0],
      user?.id || 'system_user',
      dto,
    );
  }

  @Get('movements')
  @RequirePermissions(SystemPermissions.INVENTORY_VIEW)
  findMovements(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: StockMovementFilterDto,
  ) {
    return this.movementService.findMovements(tenant.tenantId, filter);
  }
}
