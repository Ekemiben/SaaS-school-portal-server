import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { DeviceAdapterInterface, AttendanceCheckInPayload, AttendanceCheckInResult } from './device-adapter.interface.js';
import { AttendanceMethodType } from '../dto/mark-attendance.dto.js';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class RfidAttendanceAdapter implements DeviceAdapterInterface {
  readonly method: AttendanceMethodType = 'RFID';
  private readonly logger = new Logger(RfidAttendanceAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async isAvailable(tenantId: string): Promise<boolean> {
    const config = await this.prisma.attendanceConfig.findUnique({
      where: { tenantId },
    });
    return config ? !!config.rfidEnabled : false;
  }

  async processCheckIn(
    tenantId: string,
    _actorUserId: string,
    payload: AttendanceCheckInPayload,
  ): Promise<AttendanceCheckInResult> {
    const isEnabled = await this.isAvailable(tenantId);
    if (!isEnabled) {
      throw new BadRequestException('RFID attendance integration is not enabled for this school.');
    }

    if (!payload.identifier && !payload.studentId) {
      throw new BadRequestException('Card UID/badge identifier or studentId is required for RFID check-in.');
    }

    // Resolve student from studentId or RFID card UID / admissionNumber
    let student: any = null;
    if (payload.studentId) {
      student = await this.prisma.student.findFirst({
        where: { tenantId, id: payload.studentId },
        include: {
          enrollments: {
            where: { status: 'ACTIVE' },
            take: 1,
          },
        },
      });
    } else if (payload.identifier) {
      student = await this.prisma.student.findFirst({
        where: {
          tenantId,
          OR: [{ admissionNumber: payload.identifier }, { id: payload.identifier }],
        },
        include: {
          enrollments: {
            where: { status: 'ACTIVE' },
            take: 1,
          },
        },
      });
    }

    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`No student found associated with RFID identifier "${payload.identifier || payload.studentId}".`);
    }

    // Determine current active class enrollment if not supplied
    const classId = payload.classId || student.enrollments?.[0]?.classId;
    if (!classId) {
      throw new BadRequestException('Cannot determine active class for student.');
    }

    this.logger.log(`RFID Check-in processed for student ${student.admissionNumber} (${student.id}) via device ${payload.deviceId || 'GATE-01'}`);

    return {
      success: true,
      method: 'RFID',
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      classId,
      subjectId: payload.subjectId,
      sessionId: payload.sessionId,
      status: payload.status || 'PRESENT',
      timestamp: payload.timestamp || new Date(),
      remarks: payload.remarks || `RFID Check-in [Device: ${payload.deviceId || 'READER_1'}]`,
      message: 'RFID badge check-in verified successfully',
    };
  }
}
