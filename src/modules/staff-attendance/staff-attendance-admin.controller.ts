import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { CampusGuard } from '../../common/guards/campus.guard.js';
import { StaffAttendanceCoreService } from './services/staff-attendance-core.service.js';
import { StaffAttendanceReportService } from './services/staff-attendance-report.service.js';
import { StaffAttendanceConfigService } from './services/staff-attendance-config.service.js';
import {
  StaffAttendanceQueryDto,
  ManualStaffAttendanceEntryDto,
  ReviewStaffCorrectionDto,
  CreateStaffLocationDto,
  UpdateStaffLocationDto,
  UpdateStaffDeviceDto,
  UpdateStaffAttendanceConfigDto,
} from './dto/staff-attendance.dto.js';

@Controller(['api/v1/staff-attendance', 'staff-attendance'])
@UseGuards(CampusGuard)
export class StaffAttendanceAdminController {
  constructor(
    private readonly coreService: StaffAttendanceCoreService,
    private readonly reportService: StaffAttendanceReportService,
    private readonly configService: StaffAttendanceConfigService,
  ) {}

  /**
   * Daily Live Attendance Summary & KPIs
   */
  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_VIEW)
  @Get('summary')
  async getDailySummary(
    @CurrentTenant() tenant: TenantContext,
    @Query('date') date?: string,
    @Query('campusId') campusId?: string,
  ) {
    return this.reportService.getDailySummary(tenant.tenantId, date, campusId);
  }

  /**
   * Historical Attendance Records with Filters & Search
   */
  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_VIEW)
  @Get('records')
  async getRecords(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: StaffAttendanceQueryDto,
  ) {
    return this.reportService.getRecords(tenant.tenantId, query);
  }

  /**
   * Manual Attendance Entry / Admin Adjustment
   */
  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_MANAGE)
  @Post('manual')
  async manualEntry(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: ManualStaffAttendanceEntryDto,
  ) {
    return this.coreService.manualEntry(tenant.tenantId, dto);
  }

  /**
   * List Pending Correction Requests
   */
  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_MANAGE)
  @Get('corrections')
  async getCorrections(
    @CurrentTenant() tenant: TenantContext,
    @Query('status') status?: string,
  ) {
    return this.reportService.getCorrections(tenant.tenantId, status);
  }

  /**
   * Review (Approve/Reject) a Correction Request
   */
  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_MANAGE)
  @Patch('corrections/:id/review')
  async reviewCorrection(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReviewStaffCorrectionDto,
  ) {
    const reviewerId = user?.id || user?.userId;
    return this.coreService.reviewCorrection(tenant.tenantId, reviewerId, id, dto);
  }

  /**
   * Geofenced Locations CRUD
   */
  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_VIEW)
  @Get('locations')
  async getLocations(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.reportService.getLocations(tenant.tenantId, campusId);
  }

  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_MANAGE)
  @Post('locations')
  async createLocation(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateStaffLocationDto,
  ) {
    return this.reportService.createLocation(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_MANAGE)
  @Put('locations/:id')
  async updateLocation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateStaffLocationDto,
  ) {
    return this.reportService.updateLocation(tenant.tenantId, id, dto);
  }

  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_MANAGE)
  @Delete('locations/:id')
  async deleteLocation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.reportService.deleteLocation(tenant.tenantId, id);
  }

  /**
   * Device Terminals CRUD & Proxy Lock Release
   */
  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_VIEW)
  @Get('devices')
  async getDevices(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.reportService.getDevices(tenant.tenantId, campusId);
  }

  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_MANAGE)
  @Put('devices/:id')
  async updateDevice(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDeviceDto,
  ) {
    return this.reportService.updateDevice(tenant.tenantId, id, dto);
  }

  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_MANAGE)
  @Post('devices/:id/unlock')
  async unlockDevice(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.reportService.unlockDevice(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_MANAGE)
  @Delete('devices/:id')
  async deleteDevice(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.reportService.deleteDevice(tenant.tenantId, id);
  }

  /**
   * Tenant Attendance Rules & Policy Configuration
   */
  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_VIEW)
  @Get('config')
  async getConfig(@CurrentTenant() tenant: TenantContext) {
    return this.configService.getConfig(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.STAFF_ATTENDANCE_MANAGE)
  @Put('config')
  async updateConfig(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateStaffAttendanceConfigDto,
  ) {
    return this.configService.updateConfig(tenant.tenantId, dto);
  }
}
