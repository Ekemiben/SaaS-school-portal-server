import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { UpdateStaffAttendanceConfigDto } from '../dto/staff-attendance.dto.js';

@Injectable()
export class StaffAttendanceConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves or initializes default configuration for a tenant.
   */
  async getConfig(tenantId: string) {
    let config = await this.prisma.staffAttendanceConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      config = await this.prisma.staffAttendanceConfig.create({
        data: {
          tenantId,
          expectedClockInTime: '08:00',
          lateThresholdTime: '08:30',
          halfDayThresholdTime: '12:00',
          expectedClockOutTime: '16:00',
          gracePeriodMinutes: 15,
          requireGps: true,
          requireDeviceApproval: false,
          personalDeviceLockHours: 12,
          maxAllowedGpsAccuracyMeters: 100,
          autoClockOutTime: '23:59',
          allowKioskMode: true,
          allowMobileSelfClock: true,
        },
      });
    }

    return config;
  }

  /**
   * Updates tenant configuration.
   */
  async updateConfig(tenantId: string, dto: UpdateStaffAttendanceConfigDto) {
    return this.prisma.staffAttendanceConfig.upsert({
      where: { tenantId },
      update: {
        ...dto,
      },
      create: {
        tenantId,
        ...dto,
      },
    });
  }
}
