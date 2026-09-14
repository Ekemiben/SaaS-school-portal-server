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
    const config = this.prisma.memoryStore.attendanceConfigs.get(tenantId);
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

    // Resolve student from studentId or RFID card UID
    let student: any = null;
    if (payload.studentId) {
      student = this.prisma.memoryStore.students.get(payload.studentId);
    } else if (payload.identifier) {
      student = Array.from(this.prisma.memoryStore.students.values()).find(
        (s: any) => s.tenantId === tenantId && (s.rfidCardUid === payload.identifier || s.admissionNumber === payload.identifier),
      );
    }

    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`No student found associated with RFID identifier "${payload.identifier}".`);
    }

    // Determine current active class enrollment if not supplied
    let classId = payload.classId;
    if (!classId) {
      const activeEnr = Array.from(this.prisma.memoryStore.enrollments.values()).find(
        (e: any) => e.tenantId === tenantId && e.studentId === student.id && e.status === 'ACTIVE',
      );
      classId = activeEnr ? activeEnr.classId : student.classId;
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
