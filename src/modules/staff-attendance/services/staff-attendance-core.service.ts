import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { StaffAttendanceGeoService } from './staff-attendance-geo.service.js';
import { StaffAttendanceDeviceService } from './staff-attendance-device.service.js';
import { StaffAttendanceConfigService } from './staff-attendance-config.service.js';
import {
  StaffClockInDto,
  StaffClockOutDto,
  ManualStaffAttendanceEntryDto,
  RequestStaffCorrectionDto,
  ReviewStaffCorrectionDto,
} from '../dto/staff-attendance.dto.js';
import {
  StaffAttendanceStatus,
  StaffClockInStatus,
  StaffClockOutStatus,
  StaffCorrectionStatus,
} from '@prisma/client';

@Injectable()
export class StaffAttendanceCoreService {
  private readonly logger = new Logger(StaffAttendanceCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geoService: StaffAttendanceGeoService,
    private readonly deviceService: StaffAttendanceDeviceService,
    private readonly configService: StaffAttendanceConfigService,
  ) {}

  /**
   * Helper: Resolves tenant local date (YYYY-MM-DD) and time (HH:mm) given a UTC Date.
   */
  getTenantLocalDateTime(date: Date, timezone: string = 'UTC'): { dateStr: string; timeStr: string; minutesFromMidnight: number } {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(date);
      const year = parts.find((p) => p.type === 'year')?.value || '2026';
      const month = parts.find((p) => p.type === 'month')?.value || '01';
      const day = parts.find((p) => p.type === 'day')?.value || '01';
      const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

      const dateStr = `${year}-${month}-${day}`;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const minutesFromMidnight = hour * 60 + minute;

      return { dateStr, timeStr, minutesFromMidnight };
    } catch {
      // Fallback to UTC if timezone is invalid
      const year = date.getUTCFullYear();
      const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
      const day = date.getUTCDate().toString().padStart(2, '0');
      const hour = date.getUTCHours();
      const minute = date.getUTCMinutes();

      return {
        dateStr: `${year}-${month}-${day}`,
        timeStr: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
        minutesFromMidnight: hour * 60 + minute,
      };
    }
  }

  /**
   * Converts HH:mm string to minutes from midnight for easy comparison.
   */
  parseTimeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10));
    return (h || 0) * 60 + (m || 0);
  }

  /**
   * Finds active staff member by ID or Employee Number.
   */
  async findStaff(tenantId: string, staffIdentifier: string) {
    const staff = await this.prisma.staff.findFirst({
      where: {
        tenantId,
        OR: [
          { id: staffIdentifier },
          { employeeNumber: staffIdentifier },
        ],
        isActive: true,
      },
      include: {
        department: true,
        designation: true,
        campus: true,
      },
    });

    if (!staff) {
      throw new NotFoundException(`Staff record not found or inactive with identifier "${staffIdentifier}".`);
    }

    if (staff.employmentStatus === 'TERMINATED' || staff.employmentStatus === 'SUSPENDED') {
      throw new BadRequestException(`Staff member employment status is currently ${staff.employmentStatus}.`);
    }

    return staff;
  }

  /**
   * Records Staff Clock-In.
   */
  async clockIn(
    tenantId: string,
    dto: StaffClockInDto,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const staff = await this.findStaff(tenantId, dto.staffIdentifier);
    const config = await this.configService.getConfig(tenantId);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const now = new Date();
    const { dateStr, timeStr, minutesFromMidnight } = this.getTenantLocalDateTime(now, tenant?.timezone || 'UTC');

    // 1. Geofence Verification
    const geoResult = await this.geoService.verifyGeofence(
      tenantId,
      dto.latitude,
      dto.longitude,
      dto.accuracy,
      staff.campusId,
    );

    if (!geoResult.isWithinGeofence) {
      throw new BadRequestException(geoResult.reason || 'Clock-in rejected: Location is outside authorized campus geofence.');
    }

    // 2. Device Validation & Anti-Proxy Lock
    const deviceResult = await this.deviceService.validateDeviceForClocking(
      tenantId,
      staff.id,
      dto.deviceFingerprint,
      dto.kioskToken,
      meta.ipAddress,
      meta.userAgent,
    );

    // 3. Check for existing clock-in today
    const existingRecord = await this.prisma.staffAttendanceRecord.findUnique({
      where: {
        tenantId_staffId_date: {
          tenantId,
          staffId: staff.id,
          date: dateStr,
        },
      },
    });

    if (existingRecord && existingRecord.clockInTime) {
      throw new ConflictException(
        `Staff ${staff.firstName} ${staff.lastName} has already clocked in today at ${existingRecord.clockInTime.toISOString()}.`,
      );
    }

    // 4. Calculate Arrival Status
    const expectedMinutes = this.parseTimeToMinutes(config.expectedClockInTime);
    const graceMinutes = config.gracePeriodMinutes;
    const lateThresholdMinutes = this.parseTimeToMinutes(config.lateThresholdTime);
    const halfDayThresholdMinutes = this.parseTimeToMinutes(config.halfDayThresholdTime);

    let clockInStatus: StaffClockInStatus = StaffClockInStatus.ON_TIME;
    let overallStatus: StaffAttendanceStatus = StaffAttendanceStatus.PRESENT;

    if (minutesFromMidnight <= expectedMinutes) {
      clockInStatus = StaffClockInStatus.ON_TIME;
      overallStatus = StaffAttendanceStatus.PRESENT;
    } else if (minutesFromMidnight <= expectedMinutes + graceMinutes) {
      clockInStatus = StaffClockInStatus.GRACE_PERIOD;
      overallStatus = StaffAttendanceStatus.PRESENT;
    } else if (minutesFromMidnight <= halfDayThresholdMinutes) {
      clockInStatus = StaffClockInStatus.LATE;
      overallStatus = StaffAttendanceStatus.LATE;
    } else {
      clockInStatus = StaffClockInStatus.LATE;
      overallStatus = StaffAttendanceStatus.HALF_DAY;
    }

    // 5. Persist Record
    const record = await this.prisma.staffAttendanceRecord.upsert({
      where: {
        tenantId_staffId_date: {
          tenantId,
          staffId: staff.id,
          date: dateStr,
        },
      },
      update: {
        clockInTime: now,
        clockInStatus,
        status: overallStatus,
        clockInLatitude: dto.latitude,
        clockInLongitude: dto.longitude,
        clockInAccuracy: dto.accuracy,
        clockInLocationId: geoResult.matchedLocationId,
        clockInDeviceId: deviceResult.device?.id,
        clockInDistanceMeters: geoResult.distanceMeters,
        notes: dto.notes ? dto.notes : undefined,
      },
      create: {
        tenantId,
        campusId: staff.campusId,
        staffId: staff.id,
        date: dateStr,
        clockInTime: now,
        clockInStatus,
        status: overallStatus,
        clockInLatitude: dto.latitude,
        clockInLongitude: dto.longitude,
        clockInAccuracy: dto.accuracy,
        clockInLocationId: geoResult.matchedLocationId,
        clockInDeviceId: deviceResult.device?.id,
        clockInDistanceMeters: geoResult.distanceMeters,
        notes: dto.notes,
      },
      include: {
        staff: {
          include: {
            department: true,
            designation: true,
          },
        },
        clockInLocation: true,
      },
    });

    return {
      message: `Clock In Successful for ${staff.firstName} ${staff.lastName}`,
      status: overallStatus,
      clockInStatus,
      time: timeStr,
      date: dateStr,
      location: geoResult.matchedLocationName || 'Campus Location',
      record,
    };
  }

  /**
   * Records Staff Clock-Out.
   */
  async clockOut(
    tenantId: string,
    dto: StaffClockOutDto,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const staff = await this.findStaff(tenantId, dto.staffIdentifier);
    const config = await this.configService.getConfig(tenantId);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const now = new Date();
    const { dateStr, timeStr, minutesFromMidnight } = this.getTenantLocalDateTime(now, tenant?.timezone || 'UTC');

    // 1. Geofence Verification
    const geoResult = await this.geoService.verifyGeofence(
      tenantId,
      dto.latitude,
      dto.longitude,
      dto.accuracy,
      staff.campusId,
    );

    if (!geoResult.isWithinGeofence) {
      throw new BadRequestException(geoResult.reason || 'Clock-out rejected: Location is outside authorized campus geofence.');
    }

    // 2. Device Validation
    const deviceResult = await this.deviceService.validateDeviceForClocking(
      tenantId,
      staff.id,
      dto.deviceFingerprint,
      dto.kioskToken,
      meta.ipAddress,
      meta.userAgent,
    );

    // 3. Find Today's Record
    const existingRecord = await this.prisma.staffAttendanceRecord.findUnique({
      where: {
        tenantId_staffId_date: {
          tenantId,
          staffId: staff.id,
          date: dateStr,
        },
      },
    });

    if (!existingRecord || !existingRecord.clockInTime) {
      throw new BadRequestException(
        `Staff ${staff.firstName} ${staff.lastName} has not clocked in yet today (${dateStr}). Must clock in first.`,
      );
    }

    if (existingRecord.clockOutTime) {
      throw new ConflictException(
        `Staff ${staff.firstName} ${staff.lastName} has already clocked out today at ${existingRecord.clockOutTime.toISOString()}.`,
      );
    }

    // 4. Calculate Departure Status
    const expectedOutMinutes = this.parseTimeToMinutes(config.expectedClockOutTime);
    let clockOutStatus: StaffClockOutStatus = StaffClockOutStatus.NORMAL;
    let finalStatus = existingRecord.status;

    if (minutesFromMidnight < expectedOutMinutes) {
      clockOutStatus = StaffClockOutStatus.EARLY_DEPARTURE;
      if (finalStatus === StaffAttendanceStatus.PRESENT) {
        finalStatus = StaffAttendanceStatus.EARLY_DEPARTURE;
      }
    } else if (minutesFromMidnight > expectedOutMinutes + 120) {
      clockOutStatus = StaffClockOutStatus.OVERTIME;
    } else {
      clockOutStatus = StaffClockOutStatus.NORMAL;
    }

    // 5. Update Record
    const updated = await this.prisma.staffAttendanceRecord.update({
      where: { id: existingRecord.id },
      data: {
        clockOutTime: now,
        clockOutStatus,
        status: finalStatus,
        clockOutLatitude: dto.latitude,
        clockOutLongitude: dto.longitude,
        clockOutAccuracy: dto.accuracy,
        clockOutLocationId: geoResult.matchedLocationId,
        clockOutDeviceId: deviceResult.device?.id,
        clockOutDistanceMeters: geoResult.distanceMeters,
        notes: dto.notes ? `${existingRecord.notes || ''} | Out: ${dto.notes}` : existingRecord.notes,
      },
      include: {
        staff: {
          include: {
            department: true,
            designation: true,
          },
        },
        clockInLocation: true,
        clockOutLocation: true,
      },
    });

    return {
      message: `Clock Out Successful for ${staff.firstName} ${staff.lastName}`,
      status: finalStatus,
      clockOutStatus,
      time: timeStr,
      date: dateStr,
      location: geoResult.matchedLocationName || 'Campus Location',
      record: updated,
    };
  }

  /**
   * Manual Entry / Admin Override.
   */
  async manualEntry(tenantId: string, dto: ManualStaffAttendanceEntryDto) {
    const staff = await this.findStaff(tenantId, dto.staffId);

    let clockIn: Date | undefined = undefined;
    let clockOut: Date | undefined = undefined;

    if (dto.clockInTime) {
      clockIn = new Date(dto.clockInTime.includes('T') ? dto.clockInTime : `${dto.date}T${dto.clockInTime}:00Z`);
    }
    if (dto.clockOutTime) {
      clockOut = new Date(dto.clockOutTime.includes('T') ? dto.clockOutTime : `${dto.date}T${dto.clockOutTime}:00Z`);
    }

    return this.prisma.staffAttendanceRecord.upsert({
      where: {
        tenantId_staffId_date: {
          tenantId,
          staffId: staff.id,
          date: dto.date,
        },
      },
      update: {
        status: dto.status ?? StaffAttendanceStatus.PRESENT,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        isManualEntry: true,
        notes: dto.notes,
      },
      create: {
        tenantId,
        campusId: staff.campusId,
        staffId: staff.id,
        date: dto.date,
        status: dto.status ?? StaffAttendanceStatus.PRESENT,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        isManualEntry: true,
        notes: dto.notes,
      },
      include: {
        staff: {
          include: {
            department: true,
            designation: true,
          },
        },
      },
    });
  }

  /**
   * Requests a correction for an attendance record.
   */
  async requestCorrection(tenantId: string, userId: string, dto: RequestStaffCorrectionDto) {
    const record = await this.prisma.staffAttendanceRecord.findFirst({
      where: { id: dto.recordId, tenantId },
    });

    if (!record) {
      throw new NotFoundException('Attendance record not found.');
    }

    let correctedIn: Date | undefined = undefined;
    let correctedOut: Date | undefined = undefined;

    if (dto.correctedClockIn) {
      correctedIn = new Date(dto.correctedClockIn.includes('T') ? dto.correctedClockIn : `${record.date}T${dto.correctedClockIn}:00Z`);
    }
    if (dto.correctedClockOut) {
      correctedOut = new Date(dto.correctedClockOut.includes('T') ? dto.correctedClockOut : `${record.date}T${dto.correctedClockOut}:00Z`);
    }

    return this.prisma.staffAttendanceCorrection.create({
      data: {
        tenantId,
        recordId: record.id,
        requestedById: userId,
        status: StaffCorrectionStatus.PENDING,
        originalClockIn: record.clockInTime,
        originalClockOut: record.clockOutTime,
        correctedClockIn: correctedIn,
        correctedClockOut: correctedOut,
        originalStatus: record.status,
        correctedStatus: dto.correctedStatus ?? record.status,
        reason: dto.reason,
      },
      include: {
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        record: {
          include: { staff: true },
        },
      },
    });
  }

  /**
   * Reviews (Approves or Rejects) an attendance correction request.
   */
  async reviewCorrection(tenantId: string, reviewerId: string, correctionId: string, dto: ReviewStaffCorrectionDto) {
    const correction = await this.prisma.staffAttendanceCorrection.findFirst({
      where: { id: correctionId, tenantId },
      include: { record: true },
    });

    if (!correction) {
      throw new NotFoundException('Correction request not found.');
    }

    if (correction.status !== StaffCorrectionStatus.PENDING) {
      throw new BadRequestException(`This correction request has already been ${correction.status.toLowerCase()}.`);
    }

    const updatedCorrection = await this.prisma.staffAttendanceCorrection.update({
      where: { id: correctionId },
      data: {
        status: dto.status,
        reviewNotes: dto.reviewNotes,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
      include: {
        requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // If approved, apply changes directly to the StaffAttendanceRecord
    if (dto.status === StaffCorrectionStatus.APPROVED) {
      await this.prisma.staffAttendanceRecord.update({
        where: { id: correction.recordId },
        data: {
          clockInTime: correction.correctedClockIn ?? undefined,
          clockOutTime: correction.correctedClockOut ?? undefined,
          status: correction.correctedStatus,
          isManualEntry: true,
          notes: `[Correction Approved by Admin]: ${dto.reviewNotes || correction.reason}`,
        },
      });
    }

    return updatedCorrection;
  }
}
