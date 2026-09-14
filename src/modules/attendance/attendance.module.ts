import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { QueuesModule } from '../../jobs/queues.module.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceCoreService } from './services/attendance-core.service.js';
import { AttendanceSessionService } from './services/attendance-session.service.js';
import { AttendanceTruancyService } from './services/attendance-truancy.service.js';
import { AttendanceReportService } from './services/attendance-report.service.js';
import { AttendanceConfigService } from './services/attendance-config.service.js';
import { DeviceAdapterRegistryService } from './devices/device-adapter-registry.service.js';
import { ManualAttendanceAdapter } from './devices/manual-attendance.adapter.js';
import { QrAttendanceAdapter } from './devices/qr-attendance.adapter.js';
import { RfidAttendanceAdapter } from './devices/rfid-attendance.adapter.js';
import { BiometricAttendanceAdapter } from './devices/biometric-attendance.adapter.js';
import { ExternalDeviceAdapter } from './devices/external-device.adapter.js';

@Module({
  imports: [PrismaModule, QueuesModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceCoreService,
    AttendanceSessionService,
    AttendanceTruancyService,
    AttendanceReportService,
    AttendanceConfigService,
    DeviceAdapterRegistryService,
    ManualAttendanceAdapter,
    QrAttendanceAdapter,
    RfidAttendanceAdapter,
    BiometricAttendanceAdapter,
    ExternalDeviceAdapter,
  ],
  exports: [
    AttendanceService,
    AttendanceCoreService,
    AttendanceSessionService,
    AttendanceTruancyService,
    AttendanceReportService,
    AttendanceConfigService,
    DeviceAdapterRegistryService,
  ],
})
export class AttendanceModule {}
