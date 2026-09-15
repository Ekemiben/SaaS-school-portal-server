import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import { MarkAttendanceDto, AttendanceFilterDto } from '../dto/mark-attendance.dto.js';
import { CorrectAttendanceDto } from '../dto/attendance-correction.dto.js';
import { AttendanceTruancyService } from './attendance-truancy.service.js';
import { DeviceCheckInDto } from '../dto/attendance-session.dto.js';
import { DeviceAdapterRegistryService } from '../devices/device-adapter-registry.service.js';

@Injectable()
export class AttendanceCoreService {
  private readonly logger = new Logger(AttendanceCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly truancyService: AttendanceTruancyService,
    private readonly deviceRegistry: DeviceAdapterRegistryService,
  ) {}

  async markAttendance(
    tenantId: string,
    campusId: string,
    actorUserId: string,
    dto: MarkAttendanceDto,
  ) {
    let targetClass = this.prisma.memoryStore.classes.get(dto.classId);
    if (!targetClass) {
      targetClass = Array.from(this.prisma.memoryStore.classes.values()).find(
        (c: any) => c.tenantId === tenantId && (c.id === dto.classId || c.name === dto.classId),
      );
    }
    if (!targetClass || targetClass.tenantId !== tenantId) {
      throw new NotFoundException(`Class ${dto.classId} not found in this school.`);
    }
    dto.classId = targetClass.id;

    if (dto.subjectId) {
      const subject = this.prisma.memoryStore.subjects.get(dto.subjectId);
      if (!subject || subject.tenantId !== tenantId) {
        throw new NotFoundException(`Subject ${dto.subjectId} not found in this school.`);
      }
    }

    const attendanceDate = new Date(dto.date);
    const dateKey = attendanceDate.toISOString().split('T')[0];
    const sessionType = dto.sessionType || (dto.subjectId ? 'SUBJECT_PERIOD' : 'DAILY');
    const method = dto.method || 'MANUAL';
    const effectiveCampusId = dto.campusId || campusId || targetClass.campusId;

    const savedRecords: any[] = [];

    for (const recordDto of dto.records) {
      const student = this.prisma.memoryStore.students.get(recordDto.studentId);
      if (!student || student.tenantId !== tenantId) {
        throw new NotFoundException(`Student ${recordDto.studentId} not found in this school.`);
      }

      // Check for existing record within this attendance scope to update idempotently
      const existing = Array.from(this.prisma.memoryStore.attendance.values()).find(
        (a: any) =>
          a.tenantId === tenantId &&
          a.studentId === recordDto.studentId &&
          a.classId === dto.classId &&
          (dto.subjectId ? a.subjectId === dto.subjectId : (!a.subjectId || a.sessionType === 'DAILY')) &&
          (dto.sessionId ? a.sessionId === dto.sessionId : true) &&
          new Date(a.date).toISOString().split('T')[0] === dateKey,
      ) as any;

      if (existing) {
        existing.status = recordDto.status;
        existing.remarks = recordDto.remarks !== undefined ? recordDto.remarks : existing.remarks;
        existing.method = method;
        existing.markedByUserId = actorUserId;
        existing.checkInTime = recordDto.checkInTime ? new Date(recordDto.checkInTime) : existing.checkInTime;
        existing.checkOutTime = recordDto.checkOutTime ? new Date(recordDto.checkOutTime) : existing.checkOutTime;
        existing.updatedAt = new Date();
        this.prisma.memoryStore.attendance.set(existing.id, existing);
        savedRecords.push(existing);
      } else {
        const id = `att_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
        const newRecord = {
          id,
          tenantId,
          campusId: effectiveCampusId,
          studentId: recordDto.studentId,
          classId: dto.classId,
          subjectId: dto.subjectId || null,
          sessionId: dto.sessionId || null,
          sessionType,
          date: attendanceDate,
          status: recordDto.status,
          method,
          checkInTime: recordDto.checkInTime ? new Date(recordDto.checkInTime) : new Date(),
          checkOutTime: recordDto.checkOutTime ? new Date(recordDto.checkOutTime) : null,
          remarks: recordDto.remarks || null,
          markedByUserId: actorUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.prisma.memoryStore.attendance.set(id, newRecord);
        savedRecords.push(newRecord);
      }

      // If marked ABSENT, evaluate truancy and alert parents asynchronously
      if (recordDto.status === 'ABSENT') {
        this.truancyService.evaluateStudentAbsence(
          tenantId,
          effectiveCampusId,
          recordDto.studentId,
          dto.classId,
          attendanceDate,
          recordDto.remarks,
        ).catch(() => {});
      }
    }

    this.logger.log(`Marked ${savedRecords.length} attendance records for class ${dto.classId} (${sessionType})`);
    return {
      success: true,
      count: savedRecords.length,
      records: savedRecords,
    };
  }

  async recordDeviceCheckIn(
    tenantId: string,
    actorUserId: string,
    dto: DeviceCheckInDto,
  ) {
    const verified = await this.deviceRegistry.processCheckIn(tenantId, dto.method, actorUserId, {
      studentId: dto.studentId,
      identifier: dto.identifier,
      campusId: dto.campusId,
      classId: dto.classId,
      subjectId: dto.subjectId,
      sessionId: dto.sessionId,
      deviceId: dto.deviceId,
      status: dto.status || 'PRESENT',
      timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
    });

    const student = this.prisma.memoryStore.students.get(verified.studentId);
    const classId = verified.classId || student?.classId;
    if (!classId) {
      throw new BadRequestException('Cannot determine active class for student.');
    }

    return this.markAttendance(tenantId, dto.campusId, actorUserId, {
      campusId: dto.campusId,
      classId,
      subjectId: verified.subjectId,
      sessionId: verified.sessionId,
      date: verified.timestamp.toISOString(),
      method: verified.method,
      records: [
        {
          studentId: verified.studentId,
          status: verified.status,
          remarks: verified.remarks,
          checkInTime: verified.timestamp.toISOString(),
        },
      ],
    });
  }

  async correctAttendance(
    tenantId: string,
    recordId: string,
    actorUserId: string,
    dto: CorrectAttendanceDto,
  ) {
    const record = this.prisma.memoryStore.attendance.get(recordId);
    if (!record || record.tenantId !== tenantId) {
      throw new NotFoundException(`Attendance record ${recordId} not found.`);
    }

    const previousStatus = record.status;
    record.status = dto.status;
    record.remarks = `${record.remarks || ''}\nCorrection: ${previousStatus} -> ${dto.status}. Reason: ${dto.reason}`.trim();
    record.updatedAt = new Date();
    this.prisma.memoryStore.attendance.set(recordId, record);

    // Audit correction
    const correctionId = `att_cor_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const correction = {
      id: correctionId,
      tenantId,
      recordId,
      studentId: record.studentId,
      previousStatus,
      newStatus: dto.status,
      reason: dto.reason,
      changedByUserId: actorUserId,
      createdAt: new Date(),
    };
    this.prisma.memoryStore.attendanceCorrections.set(correctionId, correction);
    this.logger.log(`Audited attendance correction ${correctionId} for record ${recordId}: ${previousStatus} -> ${dto.status}`);

    return { record, correction };
  }

  async getAttendanceRecords(tenantId: string, filter: AttendanceFilterDto) {
    let list = Array.from(this.prisma.memoryStore.attendance.values()).filter(
      (a: any) => a.tenantId === tenantId,
    );

    if (filter.campusId) list = list.filter((a: any) => a.campusId === filter.campusId);
    if (filter.classId) {
      const cls = this.prisma.memoryStore.classes.get(filter.classId) ||
        Array.from(this.prisma.memoryStore.classes.values()).find(
          (c: any) => c.tenantId === tenantId && (c.id === filter.classId || c.name === filter.classId),
        );
      const matchedIds = cls ? [cls.id, cls.name] : [filter.classId];
      list = list.filter((a: any) => matchedIds.includes(a.classId));
    }
    if (filter.subjectId) list = list.filter((a: any) => a.subjectId === filter.subjectId);
    if (filter.sessionId) list = list.filter((a: any) => a.sessionId === filter.sessionId);
    if (filter.studentId) list = list.filter((a: any) => a.studentId === filter.studentId);
    if (filter.status) list = list.filter((a: any) => a.status === filter.status);
    if (filter.sessionType) list = list.filter((a: any) => a.sessionType === filter.sessionType);

    if (filter.date) {
      const targetDate = new Date(filter.date).toISOString().split('T')[0];
      list = list.filter((a: any) => new Date(a.date).toISOString().split('T')[0] === targetDate);
    } else if (filter.startDate || filter.endDate) {
      if (filter.startDate) {
        const sDate = new Date(filter.startDate);
        list = list.filter((a: any) => new Date(a.date) >= sDate);
      }
      if (filter.endDate) {
        const eDate = new Date(filter.endDate);
        list = list.filter((a: any) => new Date(a.date) <= eDate);
      }
    }

    return list.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}
