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
import { HostelAllocationService } from '../services/hostel-allocation.service.js';
import {
  AllocateBedDto,
  TransferBedDto,
  VacateBedDto,
  AllocationFilterDto,
} from '../dto/allocate-bed.dto.js';

@Controller('api/v1/hostel/allocations')
export class HostelAllocationController {
  constructor(
    private readonly allocationService: HostelAllocationService,
  ) {}

  @Post()
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  allocateBed(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: AllocateBedDto,
  ) {
    return this.allocationService.allocateBed(
      tenant.tenantId,
      tenant.campusIds?.[0] || '',
      user?.sub || 'staff_demo',
      dto,
    );
  }

  @Get()
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  listAllocations(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: AllocationFilterDto,
  ) {
    return this.allocationService.listAllocations(tenant.tenantId, filter);
  }

  @Get('student/:studentId')
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  getActiveAllocationByStudent(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
  ) {
    return this.allocationService.getActiveAllocationByStudent(tenant.tenantId, studentId);
  }

  @Post(':id/transfer')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  transferBed(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: TransferBedDto,
  ) {
    return this.allocationService.transferBed(
      tenant.tenantId,
      id,
      user?.sub || 'staff_demo',
      dto,
    );
  }

  @Post(':id/vacate')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  vacateBed(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: VacateBedDto,
  ) {
    return this.allocationService.vacateBed(tenant.tenantId, id, dto);
  }
}
