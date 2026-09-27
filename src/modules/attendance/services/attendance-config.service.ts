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
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        this.logger.warn(`Failed to fetch attendance config from DB: ${err.message}, falling back to memory store`);
      }
    }

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
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        this.logger.warn(`Failed to update attendance config in DB: ${err.message}, falling back to memory store`);
      }
    }

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
