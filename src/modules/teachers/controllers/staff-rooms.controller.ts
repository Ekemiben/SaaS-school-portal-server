import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { StaffMasterDataService } from '../services/staff-master-data.service.js';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';

@Controller('api/v1/teachers/staff-rooms')
export class StaffRoomsController {
  constructor(private readonly masterDataService: StaffMasterDataService) {}

  @RequirePermissions(SystemPermissions.TEACHERS_VIEW)
  @Get()
  async listStaffRooms(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.masterDataService.listStaffRooms(tenant.tenantId, campusId);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_VIEW)
  @Get(':id')
  async getStaffRoom(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.masterDataService.getStaffRoomById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Post()
  async createStaffRoom(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { name: string; campusId?: string; building?: string; roomNumber?: string; capacity?: number },
  ) {
    return this.masterDataService.createStaffRoom(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Patch(':id')
  async updateStaffRoom(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { name?: string; campusId?: string | null; building?: string; roomNumber?: string; capacity?: number },
  ) {
    return this.masterDataService.updateStaffRoom(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Delete(':id')
  async deleteStaffRoom(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.masterDataService.deleteStaffRoom(tenant.tenantId, id);
  }
}
