import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { LibraryFineService } from '../services/library-fine.service.js';
import { LibraryAnalyticsService } from '../services/library-analytics.service.js';
import {
  PayLibraryFineDto,
  WaiveLibraryFineDto,
} from '../dto/library-fine.dto.js';
import {
  FineFilterDto,
  LibraryStatsFilterDto,
} from '../dto/library-filter.dto.js';

@Controller('api/v1/library/fines')
export class LibraryFinesController {
  constructor(
    private readonly fineService: LibraryFineService,
    private readonly analyticsService: LibraryAnalyticsService,
  ) {}

  @Get()
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  listFines(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: FineFilterDto,
  ) {
    return this.fineService.listFines(tenant.tenantId, filter);
  }

  @Get('stats')
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  getLibraryStats(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: LibraryStatsFilterDto,
  ) {
    return this.analyticsService.getLibraryStats(tenant.tenantId, filter);
  }

  @Get('overdue-report')
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  getOverdueReport(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.analyticsService.getOverdueReport(
      tenant.tenantId,
      campusId || tenant.campusIds?.[0],
    );
  }

  @Post('overdue/calculate')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  calculateOverdueFines(@CurrentTenant() tenant: TenantContext) {
    return this.fineService.calculateOverdueFines(tenant.tenantId);
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  getFineById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.fineService.getFineById(tenant.tenantId, id);
  }

  @Post(':id/pay')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  payFine(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: PayLibraryFineDto,
  ) {
    return this.fineService.payFine(tenant.tenantId, id, dto);
  }

  @Post(':id/waive')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  waiveFine(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: WaiveLibraryFineDto,
  ) {
    return this.fineService.waiveFine(
      tenant.tenantId,
      id,
      user?.sub || 'admin_demo',
      dto,
    );
  }
}
