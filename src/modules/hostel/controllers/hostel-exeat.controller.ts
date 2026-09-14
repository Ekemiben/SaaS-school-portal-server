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
import { HostelExeatService } from '../services/hostel-exeat.service.js';
import {
  CreateExeatPassDto,
  ApproveExeatPassDto,
  LogExeatDepartureDto,
  LogExeatReturnDto,
  ExeatFilterDto,
} from '../dto/exeat-pass.dto.js';

@Controller('api/v1/hostel/exeats')
export class HostelExeatController {
  constructor(private readonly exeatService: HostelExeatService) {}

  @Post()
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  requestExeat(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateExeatPassDto,
  ) {
    return this.exeatService.requestExeat(tenant.tenantId, dto.studentId, dto);
  }

  @Get()
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  listExeats(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: ExeatFilterDto,
  ) {
    return this.exeatService.listExeats(tenant.tenantId, filter);
  }

  @Get('overdue/check')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  checkOverdueExeats(@CurrentTenant() tenant: TenantContext) {
    return this.exeatService.checkAndMarkOverdueExeats(tenant.tenantId);
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  getExeatById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.exeatService.getExeatById(tenant.tenantId, id);
  }

  @Post(':id/approval')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  approveOrRejectExeat(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ApproveExeatPassDto,
  ) {
    return this.exeatService.approveOrRejectExeat(
      tenant.tenantId,
      id,
      user?.sub || 'warden_demo',
      dto,
    );
  }

  @Post(':id/departure')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  logDeparture(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: LogExeatDepartureDto,
  ) {
    return this.exeatService.logDeparture(
      tenant.tenantId,
      id,
      user?.sub || 'warden_demo',
      dto,
    );
  }

  @Post(':id/return')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  logReturn(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: LogExeatReturnDto,
  ) {
    return this.exeatService.logReturn(
      tenant.tenantId,
      id,
      user?.sub || 'warden_demo',
      dto,
    );
  }
}
