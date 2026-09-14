import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
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
    let config = this.prisma.memoryStore.attendanceConfigs.get(tenantId);
    if (!config) {
      config = {
        id: `att_cfg_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.prisma.memoryStore.attendanceConfigs.set(tenantId, config);
    }
    return config;
  }

  async updateConfig(tenantId: string, dto: UpdateAttendanceConfigDto): Promise<TenantAttendanceConfig> {
    const current = await this.getConfig(tenantId);
    const updated: TenantAttendanceConfig = {
      ...current,
      manualEnabled: dto.manualEnabled !== undefined ? dto.manualEnabled : true, // manual is ALWAYS enabled by default
      qrEnabled: dto.qrEnabled !== undefined ? dto.qrEnabled : current.qrEnabled,
      rfidEnabled: dto.rfidEnabled !== undefined ? dto.rfidEnabled : current.rfidEnabled,
      biometricEnabled: dto.biometricEnabled !== undefined ? dto.biometricEnabled : current.biometricEnabled,
      externalDeviceEnabled: dto.externalDeviceEnabled !== undefined ? dto.externalDeviceEnabled : current.externalDeviceEnabled,
      qrTokenExpirySeconds: dto.qrTokenExpirySeconds ?? current.qrTokenExpirySeconds,
      consecutiveAbsenceThreshold: dto.consecutiveAbsenceThreshold ?? current.consecutiveAbsenceThreshold,
      lowAttendancePercentageThreshold: dto.lowAttendancePercentageThreshold ?? current.lowAttendancePercentageThreshold,
      autoNotifyParentsOnAbsence: dto.autoNotifyParentsOnAbsence !== undefined ? dto.autoNotifyParentsOnAbsence : current.autoNotifyParentsOnAbsence,
      autoNotifyParentsOnTruancy: dto.autoNotifyParentsOnTruancy !== undefined ? dto.autoNotifyParentsOnTruancy : current.autoNotifyParentsOnTruancy,
      preferredNotificationChannel: dto.preferredNotificationChannel || current.preferredNotificationChannel,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.attendanceConfigs.set(tenantId, updated);
    this.logger.log(`Updated attendance configuration for tenant ${tenantId}`);
    return updated;
  }
}
