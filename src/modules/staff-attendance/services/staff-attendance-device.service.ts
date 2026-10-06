import { Injectable, Logger, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { StaffAttendanceDeviceType, StaffAttendanceDeviceStatus } from '@prisma/client';
import crypto from 'crypto';

export interface DeviceValidationResult {
  isValid: boolean;
  device?: any;
  isKiosk: boolean;
  reason?: string;
}

@Injectable()
export class StaffAttendanceDeviceService {
  private readonly logger = new Logger(StaffAttendanceDeviceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a random cryptographic kiosk pairing token.
   */
  generateKioskToken(): { plainToken: string; hashedToken: string } {
    const plainToken = `kiosk_${crypto.randomBytes(24).toString('hex')}`;
    const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
    return { plainToken, hashedToken };
  }

  /**
   * Hashes a token for verification.
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Registers or updates a device terminal.
   */
  async registerDevice(
    tenantId: string,
    data: {
      deviceName: string;
      deviceFingerprint: string;
      deviceType?: StaffAttendanceDeviceType;
      campusId?: string;
      locationId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    let kioskTokenHash: string | undefined = undefined;
    let plainKioskToken: string | undefined = undefined;

    if (data.deviceType === StaffAttendanceDeviceType.KIOSK) {
      const tokens = this.generateKioskToken();
      plainKioskToken = tokens.plainToken;
      kioskTokenHash = tokens.hashedToken;
    }

    const device = await this.prisma.staffAttendanceDevice.upsert({
      where: {
        tenantId_deviceFingerprint: {
          tenantId,
          deviceFingerprint: data.deviceFingerprint,
        },
      },
      update: {
        deviceName: data.deviceName,
        deviceType: data.deviceType ?? StaffAttendanceDeviceType.PERSONAL_MOBILE,
        campusId: data.campusId,
        locationId: data.locationId,
        lastIpAddress: data.ipAddress,
        userAgent: data.userAgent,
        lastSeenAt: new Date(),
        ...(kioskTokenHash ? { kioskTokenHash } : {}),
      },
      create: {
        tenantId,
        deviceFingerprint: data.deviceFingerprint,
        deviceName: data.deviceName,
        deviceType: data.deviceType ?? StaffAttendanceDeviceType.PERSONAL_MOBILE,
        status: StaffAttendanceDeviceStatus.ACTIVE,
        campusId: data.campusId,
        locationId: data.locationId,
        kioskTokenHash,
        lastIpAddress: data.ipAddress,
        userAgent: data.userAgent,
        lastSeenAt: new Date(),
      },
    });

    return {
      ...device,
      ...(plainKioskToken ? { rawKioskToken: plainKioskToken } : {}),
    };
  }

  /**
   * Validates device access for clocking and enforces anti-proxy lock.
   */
  async validateDeviceForClocking(
    tenantId: string,
    staffId: string,
    deviceFingerprint?: string,
    kioskToken?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<DeviceValidationResult> {
    const config = await this.prisma.staffAttendanceConfig.findUnique({
      where: { tenantId },
    });

    const requireApproval = config?.requireDeviceApproval ?? false;
    const lockHours = config?.personalDeviceLockHours ?? 12;

    // 1. If Kiosk token provided, verify Kiosk authenticity
    if (kioskToken) {
      const hashed = this.hashToken(kioskToken);
      const kioskDevice = await this.prisma.staffAttendanceDevice.findFirst({
        where: {
          tenantId,
          kioskTokenHash: hashed,
          deviceType: StaffAttendanceDeviceType.KIOSK,
          status: StaffAttendanceDeviceStatus.ACTIVE,
        },
      });

      if (!kioskDevice) {
        throw new UnauthorizedException('Invalid or inactive Kiosk terminal credentials.');
      }

      // Update kiosk activity
      await this.prisma.staffAttendanceDevice.update({
        where: { id: kioskDevice.id },
        data: {
          lastSeenAt: new Date(),
          lastIpAddress: ipAddress,
          userAgent: userAgent,
        },
      });

      return {
        isValid: true,
        device: kioskDevice,
        isKiosk: true,
      };
    }

    // 2. Personal device or Browser self-clocking
    if (!deviceFingerprint) {
      return {
        isValid: true,
        isKiosk: false,
      };
    }

    // Lookup or record personal device
    let device = await this.prisma.staffAttendanceDevice.findUnique({
      where: {
        tenantId_deviceFingerprint: {
          tenantId,
          deviceFingerprint,
        },
      },
    });

    if (device && device.status === StaffAttendanceDeviceStatus.REVOKED) {
      throw new ForbiddenException('This device has been revoked and cannot be used to record attendance.');
    }

    if (device && device.status === StaffAttendanceDeviceStatus.PENDING_APPROVAL && requireApproval) {
      throw new ForbiddenException('This device is pending administrator approval before recording attendance.');
    }

    const now = new Date();

    // Check anti-proxy / buddy-punching lock:
    // If device was locked to a different staff member and lock hasn't expired
    if (
      device &&
      device.deviceType === StaffAttendanceDeviceType.PERSONAL_MOBILE &&
      device.lockedStaffId &&
      device.lockedStaffId !== staffId &&
      device.lockedUntil &&
      device.lockedUntil > now
    ) {
      const lockedMinutesLeft = Math.ceil((device.lockedUntil.getTime() - now.getTime()) / (1000 * 60));
      this.logger.warn(
        `Anti-proxy lock triggered on device ${device.id}. Attempted by staff ${staffId}, locked to ${device.lockedStaffId} for ${lockedMinutesLeft} more minutes.`,
      );
      throw new ForbiddenException(
        `Device Lockout: This mobile device is currently locked to another staff member. Device lock expires in ${lockedMinutesLeft} minutes.`,
      );
    }

    // Calculate new lockout window
    const lockedUntil = new Date(now.getTime() + lockHours * 60 * 60 * 1000);

    // Upsert personal device record & renew lock to current staffId
    if (device) {
      device = await this.prisma.staffAttendanceDevice.update({
        where: { id: device.id },
        data: {
          lockedStaffId: staffId,
          lockedUntil,
          lastSeenAt: now,
          lastIpAddress: ipAddress,
          userAgent: userAgent,
        },
      });
    } else {
      device = await this.prisma.staffAttendanceDevice.create({
        data: {
          tenantId,
          deviceFingerprint,
          deviceName: 'Staff Personal Device',
          deviceType: StaffAttendanceDeviceType.PERSONAL_MOBILE,
          status: requireApproval ? StaffAttendanceDeviceStatus.PENDING_APPROVAL : StaffAttendanceDeviceStatus.ACTIVE,
          lockedStaffId: staffId,
          lockedUntil,
          lastSeenAt: now,
          lastIpAddress: ipAddress,
          userAgent: userAgent,
        },
      });

      if (requireApproval) {
        throw new ForbiddenException('Your device has been registered and is pending administrator authorization.');
      }
    }

    return {
      isValid: true,
      device,
      isKiosk: false,
    };
  }
}
