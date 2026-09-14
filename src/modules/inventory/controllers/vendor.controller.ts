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
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { VendorService } from '../services/vendor.service.js';
import {
  CreateVendorDto,
  UpdateVendorDto,
} from '../dto/vendor.dto.js';
import { VendorFilterDto } from '../dto/inventory-filter.dto.js';

@Controller('api/v1/inventory/vendors')
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Post()
  @RequirePermissions(SystemPermissions.PROCUREMENT_MANAGE)
  createVendor(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateVendorDto,
  ) {
    return this.vendorService.createVendor(tenant.tenantId, dto);
  }

  @Get()
  @RequirePermissions(SystemPermissions.PROCUREMENT_VIEW)
  findAllVendors(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: VendorFilterDto,
  ) {
    return this.vendorService.findAllVendors(tenant.tenantId, filter);
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.PROCUREMENT_VIEW)
  getVendorById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.vendorService.getVendorById(tenant.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions(SystemPermissions.PROCUREMENT_MANAGE)
  updateVendor(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorService.updateVendor(tenant.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(SystemPermissions.PROCUREMENT_MANAGE)
  deleteVendor(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.vendorService.deleteVendor(tenant.tenantId, id);
  }
}
