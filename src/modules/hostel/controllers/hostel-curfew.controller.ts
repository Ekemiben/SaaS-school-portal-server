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
import { HostelCurfewService } from '../services/hostel-curfew.service.js';
import {
  CreateCurfewSessionDto,
  RecordCurfewAttendanceDto,
  CurfewFilterDto,
} from '../dto/curfew-session.dto.js';

@Controller('api/v1/hostel/curfew')
export class HostelCurfewController {
  constructor(private readonly curfewService: HostelCurfewService) {}

  @Post('sessions')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  createSession(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateCurfewSessionDto,
  ) {
    return this.curfewService.createSession(
      tenant.tenantId,
      tenant.campusIds?.[0] || '',
      user?.sub || 'warden_demo',
      dto,
    );
  }

  @Get('sessions')
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  listCurfewSessions(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: CurfewFilterDto,
  ) {
    return this.curfewService.listCurfewSessions(tenant.tenantId, filter);
  }

  @Get('sessions/:id')
  @RequirePermissions(SystemPermissions.HOSTEL_VIEW)
  getSessionById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.curfewService.getSessionById(tenant.tenantId, id);
  }

  @Post('sessions/:id/attendance')
  @RequirePermissions(SystemPermissions.HOSTEL_MANAGE)
  recordAttendance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RecordCurfewAttendanceDto,
  ) {
    return this.curfewService.recordAttendance(
      tenant.tenantId,
      id,
      user?.sub || 'warden_demo',
      dto,
    );
  }
}
