import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { TimetableService } from './timetable.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { CreateTimetableDto, CreateTimetableEntryDto } from './dto/create-timetable.dto.js';

@Controller('api/v1/timetable')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Post()
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  createTimetable(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateTimetableDto,
  ) {
    return this.timetableService.createTimetable(tenant.tenantId, dto);
  }

  @Get('class/:classId')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getTimetableByClass(
    @CurrentTenant() tenant: TenantContext,
    @Param('classId') classId: string,
    @Query('termId') termId?: string,
  ) {
    return this.timetableService.getTimetableByClass(tenant.tenantId, classId, termId);
  }

  @Get('teacher/:teacherId')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getTeacherSchedule(
    @CurrentTenant() tenant: TenantContext,
    @Param('teacherId') teacherId: string,
  ) {
    return this.timetableService.getTeacherSchedule(tenant.tenantId, teacherId);
  }

  @Post('entries')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  addEntry(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateTimetableEntryDto,
  ) {
    return this.timetableService.addEntry(tenant.tenantId, dto);
  }

  @Delete('entries/:id')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  deleteEntry(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.timetableService.deleteEntry(tenant.tenantId, id);
  }
}
