import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { PurchaseOrderService } from '../services/purchase-order.service.js';
import {
  CreatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
} from '../dto/purchase-order.dto.js';
import { PurchaseOrderFilterDto } from '../dto/inventory-filter.dto.js';

@Controller('api/v1/inventory/procurement/orders')
export class PurchaseOrderController {
  constructor(private readonly poService: PurchaseOrderService) {}

  @Post()
  @RequirePermissions(SystemPermissions.PROCUREMENT_MANAGE)
  createPurchaseOrder(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.poService.createPurchaseOrder(
      tenant.tenantId,
      tenant.campusIds?.[0],
      user?.id || 'system_user',
      dto,
    );
  }

  @Get()
  @RequirePermissions(SystemPermissions.PROCUREMENT_VIEW)
  findAllPurchaseOrders(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: PurchaseOrderFilterDto,
  ) {
    return this.poService.findAllPurchaseOrders(tenant.tenantId, filter);
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.PROCUREMENT_VIEW)
  getPurchaseOrderById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.poService.getPurchaseOrderById(tenant.tenantId, id);
  }

  @Patch(':id/approve')
  @RequirePermissions(SystemPermissions.PROCUREMENT_MANAGE)
  approvePurchaseOrder(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.poService.approvePurchaseOrder(
      tenant.tenantId,
      id,
      user?.id || 'system_user',
    );
  }

  @Patch(':id/order')
  @RequirePermissions(SystemPermissions.PROCUREMENT_MANAGE)
  orderPurchaseOrder(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.poService.orderPurchaseOrder(tenant.tenantId, id);
  }

  @Post(':id/receive')
  @RequirePermissions(SystemPermissions.PROCUREMENT_MANAGE)
  receivePurchaseOrderItems(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.poService.receivePurchaseOrderItems(
      tenant.tenantId,
      id,
      user?.id || 'system_user',
      dto,
    );
  }

  @Patch(':id/cancel')
  @RequirePermissions(SystemPermissions.PROCUREMENT_MANAGE)
  cancelPurchaseOrder(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.poService.cancelPurchaseOrder(tenant.tenantId, id, reason);
  }
}
