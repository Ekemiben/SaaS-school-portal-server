import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { UpdateAttendanceConfigDto } from '../dto/attendance-config.dto.js';

export interface TenantAttendanceConfig {
  id: string;
  tenantId: string;
  manualEnabled: boolean;
  qrEnabled: boolean;
  rfidEnabled: boolean;
  biometricEnabled: boolean;
  externalDeviceEnabled: boolean;
  qrTokenExpirySeconds: number;
  consecutiveAbsenceThreshold: number;
  lowAttendancePercentageThreshold: number;
  autoNotifyParentsOnAbsence: boolean;
  autoNotifyParentsOnTruancy: boolean;
  preferredNotificationChannel: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AttendanceConfigService {
  private readonly logger = new Logger(AttendanceConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getConfig(tenantId: string): Promise<TenantAttendanceConfig> {
    let config = await this.prisma.attendanceConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      config = await this.prisma.attendanceConfig.create({
        data: {
          tenantId,
          manualEnabled: true,
          qrEnabled: false,
          rfidEnabled: false,
          biometricEnabled: false,
          externalDeviceEnabled: false,
          qrTokenExpirySeconds: 60,
          consecutiveAbsenceThreshold: 3,
          lowAttendancePercentageThreshold: 75.0,
          autoNotifyParentsOnAbsence: true,
          autoNotifyParentsOnTruancy: true,
          preferredNotificationChannel: 'SMS',
        },
      });
    }
    return config as TenantAttendanceConfig;
  }

  async updateConfig(tenantId: string, dto: UpdateAttendanceConfigDto): Promise<TenantAttendanceConfig> {
    const updated = await this.prisma.attendanceConfig.upsert({
      where: { tenantId },
      update: {
        manualEnabled: dto.manualEnabled !== undefined ? dto.manualEnabled : true,
        qrEnabled: dto.qrEnabled !== undefined ? dto.qrEnabled : undefined,
        rfidEnabled: dto.rfidEnabled !== undefined ? dto.rfidEnabled : undefined,
        biometricEnabled: dto.biometricEnabled !== undefined ? dto.biometricEnabled : undefined,
        externalDeviceEnabled: dto.externalDeviceEnabled !== undefined ? dto.externalDeviceEnabled : undefined,
        qrTokenExpirySeconds: dto.qrTokenExpirySeconds ?? undefined,
        consecutiveAbsenceThreshold: dto.consecutiveAbsenceThreshold ?? undefined,
        lowAttendancePercentageThreshold: dto.lowAttendancePercentageThreshold ?? undefined,
        autoNotifyParentsOnAbsence: dto.autoNotifyParentsOnAbsence !== undefined ? dto.autoNotifyParentsOnAbsence : undefined,
        autoNotifyParentsOnTruancy: dto.autoNotifyParentsOnTruancy !== undefined ? dto.autoNotifyParentsOnTruancy : undefined,
        preferredNotificationChannel: dto.preferredNotificationChannel || undefined,
      },
      create: {
        tenantId,
        manualEnabled: dto.manualEnabled !== undefined ? dto.manualEnabled : true,
        qrEnabled: dto.qrEnabled ?? false,
        rfidEnabled: dto.rfidEnabled ?? false,
        biometricEnabled: dto.biometricEnabled ?? false,
        externalDeviceEnabled: dto.externalDeviceEnabled ?? false,
        qrTokenExpirySeconds: dto.qrTokenExpirySeconds ?? 60,
        consecutiveAbsenceThreshold: dto.consecutiveAbsenceThreshold ?? 3,
        lowAttendancePercentageThreshold: dto.lowAttendancePercentageThreshold ?? 75.0,
        autoNotifyParentsOnAbsence: dto.autoNotifyParentsOnAbsence ?? true,
        autoNotifyParentsOnTruancy: dto.autoNotifyParentsOnTruancy ?? true,
        preferredNotificationChannel: dto.preferredNotificationChannel || 'SMS',
      },
    });
    this.logger.log(`Persisted attendance configuration in DB for tenant ${tenantId}`);
    return updated as TenantAttendanceConfig;
  }
}
