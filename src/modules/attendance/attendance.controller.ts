import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @RequirePermissions(SystemPermissions.ATTENDANCE_VIEW)
  @Get()
  async getAttendance(
    @CurrentTenant() tenant: TenantContext,
    @Query('classId') classId?: string,
    @Query('date') date?: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.attendanceService.getAttendance(tenant.tenantId, {
      classId,
      date,
      studentId,
    });
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_VIEW)
  @Get('statistics')
  async getStatistics(
    @CurrentTenant() tenant: TenantContext,
    @Query('classId') classId?: string,
  ) {
    return this.attendanceService.getStatistics(tenant.tenantId, classId);
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_MARK)
  @Post('mark')
  async markAttendance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    const campusId = body.campusId || tenant.campusIds?.[0] || 'campus_main_01';
    return this.attendanceService.markAttendance(
      tenant.tenantId,
      campusId,
      user?.id || 'sys_user',
      body,
    );
  }
}
