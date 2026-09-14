import { Controller, Get, Post, Put, Patch, Body, Query, Param, Req, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions, Permissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { CampusGuard } from '../../common/guards/campus.guard.js';
import { MarkAttendanceDto, AttendanceFilterDto } from './dto/mark-attendance.dto.js';
import { CorrectAttendanceDto } from './dto/attendance-correction.dto.js';
import { CreateAttendanceSessionDto, GenerateQrTokenDto, QrCheckInDto, DeviceCheckInDto } from './dto/attendance-session.dto.js';
import { UpdateAttendanceConfigDto } from './dto/attendance-config.dto.js';

@Controller('api/v1/attendance')
@UseGuards(CampusGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @RequirePermissions(SystemPermissions.ATTENDANCE_VIEW)
  @Get()
  async getAttendance(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: AttendanceFilterDto,
  ) {
    return this.attendanceService.getAttendance(tenant.tenantId, filter);
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_MARK)
  @Post('mark')
  async markAttendance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: MarkAttendanceDto,
  ) {
    const campusId = body.campusId || tenant.campusIds?.[0] || 'campus_main_01';
    return this.attendanceService.markAttendance(
      tenant.tenantId,
      campusId,
      user?.id || user?.userId || 'sys_user',
      body,
    );
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_MARK)
  @Patch('records/:id/correct')
  async correctAttendance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: CorrectAttendanceDto,
  ) {
    return this.attendanceService.correctAttendance(
      tenant.tenantId,
      id,
      user?.id || user?.userId || 'sys_user',
      body,
    );
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_MARK)
  @Post('device-checkin')
  async deviceCheckIn(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: DeviceCheckInDto,
  ) {
    return this.attendanceService.recordDeviceCheckIn(
      tenant.tenantId,
      user?.id || user?.userId || 'sys_device',
      body,
    );
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_MARK)
  @Post('sessions')
  async createSession(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: CreateAttendanceSessionDto,
  ) {
    const campusId = body.campusId || tenant.campusIds?.[0] || 'campus_main_01';
    return this.attendanceService.createSession(
      tenant.tenantId,
      campusId,
      user?.id || user?.userId || 'sys_user',
      body,
    );
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_MARK)
  @Post('sessions/:id/qr-generate')
  async generateQrToken(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') sessionId: string,
    @Body() body: GenerateQrTokenDto,
  ) {
    return this.attendanceService.generateQrToken(
      tenant.tenantId,
      sessionId,
      user?.id || user?.userId || 'sys_user',
      body,
    );
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_MARK)
  @Post('qr-checkin')
  async qrCheckIn(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: QrCheckInDto,
  ) {
    return this.attendanceService.processQrCheckIn(
      tenant.tenantId,
      user?.id || user?.userId || 'sys_user',
      body,
    );
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_MARK)
  @Post('sessions/:id/close')
  async closeSession(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') sessionId: string,
  ) {
    return this.attendanceService.closeSession(
      tenant.tenantId,
      sessionId,
      user?.id || user?.userId || 'sys_user',
    );
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_VIEW)
  @Get('reports/daily')
  async getDailyReport(
    @CurrentTenant() tenant: TenantContext,
    @Query('classId') classId: string,
    @Query('date') date: string,
  ) {
    return this.attendanceService.getDailyReport(tenant.tenantId, classId, date);
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_VIEW)
  @Get('reports/student/:id')
  async getStudentHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') studentId: string,
    @Query() query: any,
  ) {
    return this.attendanceService.getStudentHistory(tenant.tenantId, studentId, query);
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_VIEW)
  @Get('reports/subject')
  async getSubjectReport(
    @CurrentTenant() tenant: TenantContext,
    @Query('subjectId') subjectId: string,
    @Query('classId') classId?: string,
  ) {
    return this.attendanceService.getSubjectReport(tenant.tenantId, subjectId, classId);
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_VIEW)
  @Get('reports/truancy')
  async getTruancyReport(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.attendanceService.getTruancyReport(tenant.tenantId, campusId);
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_VIEW)
  @Get('statistics')
  async getStatistics(
    @CurrentTenant() tenant: TenantContext,
    @Query('classId') classId?: string,
  ) {
    return this.attendanceService.getStatistics(tenant.tenantId, classId);
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_VIEW)
  @Get('config')
  async getConfig(@CurrentTenant() tenant: TenantContext) {
    return this.attendanceService.getConfig(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.ATTENDANCE_MARK)
  @Put('config')
  async updateConfig(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpdateAttendanceConfigDto,
  ) {
    return this.attendanceService.updateConfig(tenant.tenantId, body);
  }
}
