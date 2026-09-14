import { Injectable } from '@nestjs/common';
import { AttendanceCoreService } from './services/attendance-core.service.js';
import { AttendanceReportService } from './services/attendance-report.service.js';
import { AttendanceConfigService } from './services/attendance-config.service.js';
import { AttendanceSessionService } from './services/attendance-session.service.js';
import { MarkAttendanceDto, AttendanceFilterDto } from './dto/mark-attendance.dto.js';
import { CorrectAttendanceDto } from './dto/attendance-correction.dto.js';
import { CreateAttendanceSessionDto, GenerateQrTokenDto, QrCheckInDto, DeviceCheckInDto } from './dto/attendance-session.dto.js';
import { UpdateAttendanceConfigDto } from './dto/attendance-config.dto.js';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly coreService: AttendanceCoreService,
    private readonly reportService: AttendanceReportService,
    private readonly configService: AttendanceConfigService,
    private readonly sessionService: AttendanceSessionService,
  ) {}

  async getAttendance(
    tenantId: string,
    filters: { classId?: string; date?: string; studentId?: string; subjectId?: string },
  ) {
    return this.coreService.getAttendanceRecords(tenantId, filters as AttendanceFilterDto);
  }

  async markAttendance(
    tenantId: string,
    campusId: string,
    userId: string,
    data: MarkAttendanceDto,
  ) {
    return this.coreService.markAttendance(tenantId, campusId, userId, data);
  }

  async correctAttendance(
    tenantId: string,
    recordId: string,
    userId: string,
    dto: CorrectAttendanceDto,
  ) {
    return this.coreService.correctAttendance(tenantId, recordId, userId, dto);
  }

  async recordDeviceCheckIn(
    tenantId: string,
    userId: string,
    dto: DeviceCheckInDto,
  ) {
    return this.coreService.recordDeviceCheckIn(tenantId, userId, dto);
  }

  async getStatistics(tenantId: string, classId?: string) {
    if (classId) {
      const today = new Date().toISOString().split('T')[0];
      try {
        return await this.reportService.getDailyClassReport(tenantId, classId, today);
      } catch {
        // Fallback if class not found or no records
      }
    }
    const records = await this.coreService.getAttendanceRecords(tenantId, { classId });
    const total = records.length;
    if (total === 0) {
      return { totalRecords: 0, presentRate: 100, absentRate: 0, lateRate: 0, chronicAbsentees: [] };
    }
    const presentCount = records.filter((r: any) => r.status === 'PRESENT').length;
    const absentCount = records.filter((r: any) => r.status === 'ABSENT').length;
    const lateCount = records.filter((r: any) => r.status === 'LATE').length;
    return {
      totalRecords: total,
      presentRate: Math.round((presentCount / total) * 100),
      absentRate: Math.round((absentCount / total) * 100),
      lateRate: Math.round((lateCount / total) * 100),
      chronicAbsentees: [],
    };
  }

  // Session & QR
  async createSession(tenantId: string, campusId: string, userId: string, dto: CreateAttendanceSessionDto) {
    return this.sessionService.createSession(tenantId, campusId, userId, dto);
  }

  async generateQrToken(tenantId: string, sessionId: string, userId: string, dto?: GenerateQrTokenDto) {
    return this.sessionService.generateQrToken(tenantId, sessionId, userId, dto);
  }

  async processQrCheckIn(tenantId: string, userId: string, dto: QrCheckInDto) {
    return this.sessionService.processQrCheckIn(tenantId, userId, dto);
  }

  async closeSession(tenantId: string, sessionId: string, userId: string) {
    return this.sessionService.closeSession(tenantId, sessionId, userId);
  }

  // Reports
  async getDailyReport(tenantId: string, classId: string, date: string) {
    return this.reportService.getDailyClassReport(tenantId, classId, date);
  }

  async getStudentHistory(tenantId: string, studentId: string, query?: any) {
    return this.reportService.getStudentAttendanceHistory(tenantId, studentId, query);
  }

  async getSubjectReport(tenantId: string, subjectId: string, classId?: string) {
    return this.reportService.getSubjectAttendanceReport(tenantId, subjectId, classId);
  }

  async getTruancyReport(tenantId: string, campusId?: string) {
    return this.reportService.getTruancySummary(tenantId, campusId);
  }

  // Config
  async getConfig(tenantId: string) {
    return this.configService.getConfig(tenantId);
  }

  async updateConfig(tenantId: string, dto: UpdateAttendanceConfigDto) {
    return this.configService.updateConfig(tenantId, dto);
  }
}
