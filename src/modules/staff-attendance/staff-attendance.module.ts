import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { StaffAttendanceGeoService } from './services/staff-attendance-geo.service.js';
import { StaffAttendanceDeviceService } from './services/staff-attendance-device.service.js';
import { StaffAttendanceConfigService } from './services/staff-attendance-config.service.js';
import { StaffAttendanceCoreService } from './services/staff-attendance-core.service.js';
import { StaffAttendanceReportService } from './services/staff-attendance-report.service.js';
import { StaffAttendanceClockController } from './staff-attendance-clock.controller.js';
import { StaffAttendanceAdminController } from './staff-attendance-admin.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [StaffAttendanceClockController, StaffAttendanceAdminController],
  providers: [
    StaffAttendanceGeoService,
    StaffAttendanceDeviceService,
    StaffAttendanceConfigService,
    StaffAttendanceCoreService,
    StaffAttendanceReportService,
  ],
  exports: [
    StaffAttendanceGeoService,
    StaffAttendanceDeviceService,
    StaffAttendanceConfigService,
    StaffAttendanceCoreService,
    StaffAttendanceReportService,
  ],
})
export class StaffAttendanceModule {}
