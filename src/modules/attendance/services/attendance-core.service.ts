import { Injectable, NotFoundException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { OutboxService } from '../../../infrastructure/outbox/outbox.service.js';
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
    @Optional() private readonly outboxService?: OutboxService,
  ) {}

  async markAttendance(
    tenantId: string,
    campusId: string,
    actorUserId: string,
    dto: MarkAttendanceDto,
  ) {
    const targetClass = await this.prisma.class.findFirst({
      where: {
        tenantId,
        OR: [{ id: dto.classId }, { name: dto.classId }],
      },
    });

    if (!targetClass) {
      throw new NotFoundException(`Class ${dto.classId} not found in this school.`);
    }
    dto.classId = targetClass.id;

    if (dto.subjectId) {
      const subject = await this.prisma.subject.findFirst({
        where: { tenantId, id: dto.subjectId },
      });

      if (!subject) {
        throw new NotFoundException(`Subject ${dto.subjectId} not found in this school.`);
      }
    }

    const attendanceDate = new Date(dto.date);
    const sessionType = dto.sessionType || (dto.subjectId ? 'SUBJECT_PERIOD' : 'DAILY');
    const method = dto.method || 'MANUAL';
    const effectiveCampusId = dto.campusId || campusId || targetClass.campusId;

    const startOfDay = new Date(attendanceDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(attendanceDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const savedRecords: any[] = [];

    for (const recordDto of dto.records) {
      const student = await this.prisma.student.findFirst({
        where: { tenantId, id: recordDto.studentId },
      });

      if (!student) {
        throw new NotFoundException(`Student ${recordDto.studentId} not found in this school.`);
      }

      const existing = await this.prisma.attendance.findFirst({
        where: {
          tenantId,
          studentId: recordDto.studentId,
          classId: dto.classId,
          ...(dto.subjectId ? { subjectId: dto.subjectId } : { sessionType }),
          ...(dto.sessionId ? { sessionId: dto.sessionId } : {}),
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      if (existing) {
        const updated = await this.prisma.attendance.update({
          where: { id: existing.id },
          data: {
            status: recordDto.status as any,
            remarks: recordDto.remarks !== undefined ? recordDto.remarks : existing.remarks,
            method,
            markedByUserId: actorUserId,
            checkInTime: recordDto.checkInTime ? new Date(recordDto.checkInTime) : existing.checkInTime,
            checkOutTime: recordDto.checkOutTime ? new Date(recordDto.checkOutTime) : existing.checkOutTime,
          },
        });
        savedRecords.push(updated);
      } else {
        const created = await this.prisma.attendance.create({
          data: {
            tenantId,
            campusId: effectiveCampusId,
            studentId: recordDto.studentId,
            classId: dto.classId,
            subjectId: dto.subjectId || null,
            sessionId: dto.sessionId || null,
            sessionType,
            date: attendanceDate,
            status: recordDto.status as any,
            method,
            checkInTime: recordDto.checkInTime ? new Date(recordDto.checkInTime) : new Date(),
            checkOutTime: recordDto.checkOutTime ? new Date(recordDto.checkOutTime) : null,
            remarks: recordDto.remarks || null,
            markedByUserId: actorUserId,
          },
        });
        savedRecords.push(created);
      }

      // If marked ABSENT, evaluate truancy and alert parents with fault isolation
      if (recordDto.status === 'ABSENT') {
        try {
          await this.truancyService.evaluateStudentAbsence(
            tenantId,
            effectiveCampusId,
            recordDto.studentId,
            dto.classId,
            attendanceDate,
            recordDto.remarks,
          );
        } catch (err: any) {
          this.logger.warn(`Truancy evaluation warning: ${err?.message}`);
        }
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

    let classId = verified.classId;
    if (!classId) {
      const student = await this.prisma.student.findFirst({
        where: { tenantId, id: verified.studentId },
        include: {
          enrollments: {
            where: { status: 'ACTIVE' },
            take: 1,
          },
        },
      });
      classId = student?.enrollments?.[0]?.classId;
    }
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
    const record = await this.prisma.attendance.findFirst({
      where: { id: recordId, tenantId },
    });
    if (!record) {
      throw new NotFoundException(`Attendance record ${recordId} not found.`);
    }

    const previousStatus = record.status;
    const remarks = `${record.remarks || ''}\nCorrection: ${previousStatus} -> ${dto.status}. Reason: ${dto.reason}`.trim();

    const updatedRecord = await this.prisma.attendance.update({
      where: { id: recordId },
      data: {
        status: dto.status as any,
        remarks,
      },
    });

    const correction = await this.prisma.attendanceCorrection.create({
      data: {
        tenantId,
        recordId,
        studentId: record.studentId,
        previousStatus: previousStatus as any,
        newStatus: dto.status as any,
        reason: dto.reason,
        changedByUserId: actorUserId,
      },
    });

    this.logger.log(`Audited attendance correction ${correction.id} for record ${recordId}: ${previousStatus} -> ${dto.status}`);

    if (this.outboxService) {
      await this.outboxService.recordEvent(
        tenantId,
        'ATTENDANCE_CORRECTED',
        {
          correctionId: correction.id,
          recordId,
          studentId: record.studentId,
          previousStatus,
          newStatus: dto.status,
          reason: dto.reason,
          changedByUserId: actorUserId,
          correctedAt: new Date().toISOString(),
        },
      );
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: 'ATTENDANCE_CORRECTED',
        resourceType: 'Attendance',
        resourceId: recordId,
        beforeData: {
          status: previousStatus,
        } as any,
        afterData: {
          studentId: record.studentId,
          status: dto.status,
          reason: dto.reason,
        } as any,
      },
    });

    return { record: updatedRecord, correction };
  }

  async getAttendanceRecords(tenantId: string, filter: AttendanceFilterDto) {
    const where: any = { tenantId };

    if (filter.campusId) where.campusId = filter.campusId;

    if (filter.classId) {
      const cls = await this.prisma.class.findFirst({
        where: {
          tenantId,
          OR: [{ id: filter.classId }, { name: filter.classId }],
        },
      });
      if (cls) {
        where.classId = cls.id;
      } else {
        where.classId = filter.classId;
      }
    }

    if (filter.subjectId) where.subjectId = filter.subjectId;
    if (filter.sessionId) where.sessionId = filter.sessionId;
    if (filter.studentId) where.studentId = filter.studentId;
    if (filter.status) where.status = filter.status as any;
    if (filter.sessionType) where.sessionType = filter.sessionType;

    if (filter.date) {
      const d = new Date(filter.date);
      const start = new Date(d);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setUTCHours(23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    } else if (filter.startDate || filter.endDate) {
      where.date = {};
      if (filter.startDate) where.date.gte = new Date(filter.startDate);
      if (filter.endDate) where.date.lte = new Date(filter.endDate);
    }

    const records = await this.prisma.attendance.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            phone: true,
          },
        },
        class: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    return records;
  }
}
