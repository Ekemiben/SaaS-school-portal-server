import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Ip,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { CampusGuard } from '../../common/guards/campus.guard.js';
import { StaffAttendanceCoreService } from './services/staff-attendance-core.service.js';
import { StaffAttendanceReportService } from './services/staff-attendance-report.service.js';
import { StaffAttendanceDeviceService } from './services/staff-attendance-device.service.js';
import {
  StaffClockInDto,
  StaffClockOutDto,
  RegisterStaffDeviceDto,
  RequestStaffCorrectionDto,
} from './dto/staff-attendance.dto.js';

@Controller(['api/v1/staff-attendance/clock', 'staff-attendance/clock'])
@UseGuards(CampusGuard)
export class StaffAttendanceClockController {
  constructor(
    private readonly coreService: StaffAttendanceCoreService,
    private readonly reportService: StaffAttendanceReportService,
    private readonly deviceService: StaffAttendanceDeviceService,
  ) {}

  /**
   * Clock In Endpoint (Kiosk or Self-Service)
   */
  @Post('in')
  async clockIn(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: StaffClockInDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.coreService.clockIn(tenant.tenantId, dto, {
      ipAddress: ip,
      userAgent,
    });
  }

  /**
   * Clock Out Endpoint (Kiosk or Self-Service)
   */
  @Post('out')
  async clockOut(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: StaffClockOutDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.coreService.clockOut(tenant.tenantId, dto, {
      ipAddress: ip,
      userAgent,
    });
  }

  /**
   * Kiosk Staff Verification (Quick info lookup by employee number or QR token)
   */
  @Get('lookup')
  async lookupStaff(
    @CurrentTenant() tenant: TenantContext,
    @Query('identifier') identifier: string,
  ) {
    const staff = await this.coreService.findStaff(tenant.tenantId, identifier);
    return {
      id: staff.id,
      employeeNumber: staff.employeeNumber,
      firstName: staff.firstName,
      lastName: staff.lastName,
      department: staff.department?.name,
      designation: staff.designation?.name,
      campus: staff.campus?.name,
    };
  }

  /**
   * Register a new Kiosk Terminal or Mobile Device
   */
  @Post('devices/register')
  async registerDevice(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: RegisterStaffDeviceDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.deviceService.registerDevice(tenant.tenantId, {
      ...dto,
      ipAddress: ip,
      userAgent,
    });
  }

  /**
   * Self-Service: Get Current User's Personal Attendance Record
   */
  @Get('my-attendance')
  async getMyAttendance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = user?.id || user?.userId;
    return this.reportService.getMyAttendance(tenant.tenantId, userId, startDate, endDate);
  }

  /**
   * Self-Service: Request Attendance Correction
   */
  @Post('corrections/request')
  async requestCorrection(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: RequestStaffCorrectionDto,
  ) {
    const userId = user?.id || user?.userId;
    return this.coreService.requestCorrection(tenant.tenantId, userId, dto);
  }
}
