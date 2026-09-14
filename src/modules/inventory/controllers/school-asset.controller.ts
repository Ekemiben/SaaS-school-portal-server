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
import { SchoolAssetService } from '../services/school-asset.service.js';
import { AssetMaintenanceService } from '../services/asset-maintenance.service.js';
import { AssetDepreciationService } from '../services/asset-depreciation.service.js';
import {
  CreateSchoolAssetDto,
  UpdateSchoolAssetDto,
} from '../dto/school-asset.dto.js';
import {
  CreateMaintenanceLogDto,
  UpdateMaintenanceLogDto,
} from '../dto/asset-maintenance.dto.js';
import { CalculateDepreciationDto } from '../dto/asset-depreciation.dto.js';
import { SchoolAssetFilterDto } from '../dto/inventory-filter.dto.js';

@Controller('api/v1/inventory/assets')
export class SchoolAssetController {
  constructor(
    private readonly assetService: SchoolAssetService,
    private readonly maintenanceService: AssetMaintenanceService,
    private readonly depreciationService: AssetDepreciationService,
  ) {}

  @Post()
  @RequirePermissions(SystemPermissions.ASSETS_MANAGE)
  createAsset(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateSchoolAssetDto,
  ) {
    return this.assetService.createAsset(
      tenant.tenantId,
      tenant.campusIds?.[0],
      dto,
    );
  }

  @Get()
  @RequirePermissions(SystemPermissions.ASSETS_VIEW)
  findAllAssets(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: SchoolAssetFilterDto,
  ) {
    return this.assetService.findAllAssets(tenant.tenantId, filter);
  }

  @Get('maintenance')
  @RequirePermissions(SystemPermissions.ASSETS_VIEW)
  getMaintenanceLogs(
    @CurrentTenant() tenant: TenantContext,
    @Query('assetId') assetId?: string,
    @Query('status') status?: string,
  ) {
    return this.maintenanceService.getMaintenanceLogs(
      tenant.tenantId,
      assetId,
      status,
    );
  }

  @Post('maintenance')
  @RequirePermissions(SystemPermissions.ASSETS_MANAGE)
  createMaintenanceLog(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateMaintenanceLogDto,
  ) {
    return this.maintenanceService.createMaintenanceLog(
      tenant.tenantId,
      dto,
    );
  }

  @Patch('maintenance/:id')
  @RequirePermissions(SystemPermissions.ASSETS_MANAGE)
  updateMaintenanceLog(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateMaintenanceLogDto,
  ) {
    return this.maintenanceService.updateMaintenanceLog(
      tenant.tenantId,
      id,
      dto,
    );
  }

  @Post('depreciation/process-bulk')
  @RequirePermissions(SystemPermissions.ASSETS_MANAGE)
  processBulkDepreciation(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CalculateDepreciationDto,
  ) {
    return this.depreciationService.processBulkDepreciation(
      tenant.tenantId,
      tenant.campusIds?.[0],
      user?.id || 'system_user',
      dto,
    );
  }

  @Get('depreciation/schedules')
  @RequirePermissions(SystemPermissions.ASSETS_VIEW)
  getDepreciationSchedules(
    @CurrentTenant() tenant: TenantContext,
    @Query('assetId') assetId?: string,
    @Query('financialYear') financialYear?: string,
  ) {
    return this.depreciationService.getDepreciationSchedules(
      tenant.tenantId,
      assetId,
      financialYear,
    );
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.ASSETS_VIEW)
  getAssetById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.assetService.getAssetById(tenant.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions(SystemPermissions.ASSETS_MANAGE)
  updateAsset(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateSchoolAssetDto,
  ) {
    return this.assetService.updateAsset(tenant.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(SystemPermissions.ASSETS_MANAGE)
  deleteAsset(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.assetService.deleteAsset(tenant.tenantId, id);
  }
}
