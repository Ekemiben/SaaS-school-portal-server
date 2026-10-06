import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  StaffAttendanceQueryDto,
  CreateStaffLocationDto,
  UpdateStaffLocationDto,
  RegisterStaffDeviceDto,
  UpdateStaffDeviceDto,
} from '../dto/staff-attendance.dto.js';
import { StaffAttendanceStatus } from '@prisma/client';

@Injectable()
export class StaffAttendanceReportService {
  private readonly logger = new Logger(StaffAttendanceReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: Resolves today's local date string for a tenant.
   */
  getTodayDateStr(timezone: string = 'UTC'): string {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(new Date());
    } catch {
      const d = new Date();
      return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
    }
  }

  /**
   * Retrieves live daily attendance KPIs & summary for the dashboard.
   */
  async getDailySummary(tenantId: string, date?: string, campusId?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const targetDate = date || this.getTodayDateStr(tenant?.timezone || 'UTC');

    // Total active staff count
    const totalStaff = await this.prisma.staff.count({
      where: {
        tenantId,
        isActive: true,
        employmentStatus: 'ACTIVE',
        ...(campusId ? { campusId } : {}),
      },
    });

    // Attendance records for this date
    const records = await this.prisma.staffAttendanceRecord.findMany({
      where: {
        tenantId,
        date: targetDate,
        ...(campusId ? { campusId } : {}),
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

    let present = 0;
    let late = 0;
    let onTime = 0;
    let gracePeriod = 0;
    let halfDay = 0;
    let earlyDeparture = 0;
    let clockedOut = 0;
    let onLeave = 0;

    for (const r of records) {
      if (r.status === StaffAttendanceStatus.PRESENT) present++;
      if (r.status === StaffAttendanceStatus.LATE || r.clockInStatus === 'LATE') late++;
      if (r.clockInStatus === 'ON_TIME') onTime++;
      if (r.clockInStatus === 'GRACE_PERIOD') gracePeriod++;
      if (r.status === StaffAttendanceStatus.HALF_DAY) halfDay++;
      if (r.status === StaffAttendanceStatus.EARLY_DEPARTURE || r.clockOutStatus === 'EARLY_DEPARTURE') earlyDeparture++;
      if (r.clockOutTime) clockedOut++;
      if (r.status === StaffAttendanceStatus.ON_LEAVE) onLeave++;
    }

    const recordedStaffIds = new Set(records.map((r) => r.staffId));
    const absent = Math.max(0, totalStaff - records.length);
    const attendanceRate = totalStaff > 0 ? Math.round(((records.length - onLeave) / totalStaff) * 100) : 0;

    return {
      date: targetDate,
      totalStaff,
      totalRecorded: records.length,
      present: present + onTime + gracePeriod,
      onTime,
      gracePeriod,
      late,
      halfDay,
      earlyDeparture,
      clockedOut,
      absent,
      onLeave,
      attendanceRate,
      records,
    };
  }

  /**
   * Queries historical attendance records with filtering, search, and pagination.
   */
  async getRecords(tenantId: string, query: StaffAttendanceQueryDto) {
    const {
      date,
      startDate,
      endDate,
      campusId,
      departmentId,
      designationId,
      staffId,
      status,
      search,
      page = 1,
      limit = 50,
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
      ...(date ? { date } : {}),
      ...(startDate && endDate ? { date: { gte: startDate, lte: endDate } } : {}),
      ...(startDate && !endDate ? { date: { gte: startDate } } : {}),
      ...(!startDate && endDate ? { date: { lte: endDate } } : {}),
      ...(campusId ? { campusId } : {}),
      ...(staffId ? { staffId } : {}),
      ...(status ? { status } : {}),
    };

    if (departmentId || designationId || search) {
      where.staff = {
        ...(departmentId ? { departmentId } : {}),
        ...(designationId ? { designationId } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { employeeNumber: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
    }

    const [total, records] = await Promise.all([
      this.prisma.staffAttendanceRecord.count({ where }),
      this.prisma.staffAttendanceRecord.findMany({
        where,
        include: {
          staff: {
            include: {
              department: true,
              designation: true,
              campus: true,
            },
          },
          clockInLocation: true,
          clockOutLocation: true,
          clockInDevice: true,
          clockOutDevice: true,
          corrections: {
            include: {
              requestedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ date: 'desc' }, { clockInTime: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      data: records,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Queries personal attendance for a staff member (self-service).
   */
  async getMyAttendance(tenantId: string, userId: string, startDate?: string, endDate?: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { tenantId, userId },
      include: { department: true, designation: true, campus: true },
    });

    if (!staff) {
      throw new NotFoundException('No linked staff record found for current user account.');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const today = this.getTodayDateStr(tenant?.timezone || 'UTC');

    const records = await this.prisma.staffAttendanceRecord.findMany({
      where: {
        tenantId,
        staffId: staff.id,
        ...(startDate && endDate ? { date: { gte: startDate, lte: endDate } } : {}),
        ...(startDate && !endDate ? { date: { gte: startDate } } : {}),
      },
      include: {
        clockInLocation: true,
        clockOutLocation: true,
        corrections: true,
      },
      orderBy: { date: 'desc' },
      take: 60,
    });

    const todayRecord = records.find((r) => r.date === today) || null;

    return {
      staff,
      todayDate: today,
      todayRecord,
      history: records,
    };
  }

  /**
   * Geofence Locations Management
   */
  async getLocations(tenantId: string, campusId?: string) {
    return this.prisma.staffAttendanceLocation.findMany({
      where: {
        tenantId,
        ...(campusId ? { campusId } : {}),
      },
      include: {
        campus: true,
        _count: { select: { devices: true, clockInRecords: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLocation(tenantId: string, dto: CreateStaffLocationDto) {
    return this.prisma.staffAttendanceLocation.create({
      data: {
        tenantId,
        ...dto,
      },
      include: { campus: true },
    });
  }

  async updateLocation(tenantId: string, id: string, dto: UpdateStaffLocationDto) {
    return this.prisma.staffAttendanceLocation.update({
      where: { id },
      data: { ...dto },
      include: { campus: true },
    });
  }

  async deleteLocation(tenantId: string, id: string) {
    return this.prisma.staffAttendanceLocation.delete({
      where: { id },
    });
  }

  /**
   * Device Terminals Management
   */
  async getDevices(tenantId: string, campusId?: string) {
    return this.prisma.staffAttendanceDevice.findMany({
      where: {
        tenantId,
        ...(campusId ? { campusId } : {}),
      },
      include: {
        campus: true,
        location: true,
        lockedStaff: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async updateDevice(tenantId: string, id: string, dto: UpdateStaffDeviceDto) {
    return this.prisma.staffAttendanceDevice.update({
      where: { id },
      data: { ...dto },
      include: { campus: true, location: true },
    });
  }

  async unlockDevice(tenantId: string, id: string) {
    return this.prisma.staffAttendanceDevice.update({
      where: { id },
      data: {
        lockedStaffId: null,
        lockedUntil: null,
      },
    });
  }

  async deleteDevice(tenantId: string, id: string) {
    return this.prisma.staffAttendanceDevice.delete({
      where: { id },
    });
  }

  /**
   * Correction Requests Management
   */
  async getCorrections(tenantId: string, status?: string) {
    return this.prisma.staffAttendanceCorrection.findMany({
      where: {
        tenantId,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        record: {
          include: {
            staff: {
              include: { department: true, designation: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
