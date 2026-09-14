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
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { HostelService } from '../services/hostel.service.js';
import { HostelAnalyticsService } from '../services/hostel-analytics.service.js';
import {
  CreateHostelDto,
  UpdateHostelDto,
  CreateHostelRoomDto,
  UpdateHostelRoomDto,
  CreateHostelBedDto,
  UpdateHostelBedDto,
} from '../dto/create-hostel.dto.js';
import {
  HostelFilterDto,
  RoomFilterDto,
  BedFilterDto,
  HostelSummaryFilterDto,
} from '../dto/hostel-filter.dto.js';

@Controller('api/v1/hostel')
export class HostelController {
  constructor(
    private readonly hostelService: HostelService,
    private readonly analyticsService: HostelAnalyticsService,
  ) {}

  @Post()
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  createHostel(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateHostelDto,
  ) {
    return this.hostelService.createHostel(tenant.tenantId, tenant.campusIds?.[0] || '', dto);
  }

  @Get()
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  listHostels(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: HostelFilterDto,
  ) {
    return this.hostelService.listHostels(tenant.tenantId, tenant.campusIds?.[0], filter);
  }

  @Get('stats')
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  getHostelStats(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: HostelSummaryFilterDto,
  ) {
    return this.analyticsService.getHostelSummary(tenant.tenantId, filter);
  }

  @Get('residents')
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  getResidentDirectory(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
    @Query('hostelId') hostelId?: string,
  ) {
    return this.analyticsService.getResidentDirectory(
      tenant.tenantId,
      campusId || tenant.campusIds?.[0],
      hostelId,
    );
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  getHostelById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.hostelService.getHostelById(tenant.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  updateHostel(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateHostelDto,
  ) {
    return this.hostelService.updateHostel(tenant.tenantId, id, dto);
  }

  // --- Rooms ---

  @Post('rooms')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  createRoom(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateHostelRoomDto,
  ) {
    return this.hostelService.createRoom(tenant.tenantId, tenant.campusIds?.[0] || '', dto);
  }

  @Get('rooms')
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  listRooms(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: RoomFilterDto,
  ) {
    return this.hostelService.listRooms(tenant.tenantId, filter);
  }

  @Get('rooms/:id')
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  getRoomById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.hostelService.getRoomById(tenant.tenantId, id);
  }

  @Patch('rooms/:id')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  updateRoom(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateHostelRoomDto,
  ) {
    return this.hostelService.updateRoom(tenant.tenantId, id, dto);
  }

  // --- Beds ---

  @Post('beds')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  createBed(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateHostelBedDto,
  ) {
    return this.hostelService.createBed(tenant.tenantId, tenant.campusIds?.[0] || '', dto);
  }

  @Get('beds')
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  listBeds(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: BedFilterDto,
  ) {
    return this.hostelService.listBeds(tenant.tenantId, filter);
  }

  @Get('beds/:id')
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  getBedById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.hostelService.getBedById(tenant.tenantId, id);
  }

  @Patch('beds/:id')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  updateBed(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateHostelBedDto,
  ) {
    return this.hostelService.updateBed(tenant.tenantId, id, dto);
  }
}
