import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { DeviceAdapterInterface, AttendanceCheckInPayload, AttendanceCheckInResult } from './device-adapter.interface.js';
import { AttendanceMethodType } from '../dto/mark-attendance.dto.js';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class ExternalDeviceAdapter implements DeviceAdapterInterface {
  readonly method: AttendanceMethodType = 'EXTERNAL_DEVICE';
  private readonly logger = new Logger(ExternalDeviceAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async isAvailable(tenantId: string): Promise<boolean> {
    const config = this.prisma.memoryStore.attendanceConfigs.get(tenantId);
    return config ? !!config.externalDeviceEnabled : false;
  }

  async processCheckIn(
    tenantId: string,
    _actorUserId: string,
    payload: AttendanceCheckInPayload,
  ): Promise<AttendanceCheckInResult> {
    const isEnabled = await this.isAvailable(tenantId);
    if (!isEnabled) {
      throw new BadRequestException('External device attendance integration is not enabled for this school.');
    }

    if (!payload.identifier && !payload.studentId) {
      throw new BadRequestException('studentId or external device identifier is required.');
    }

    let student: any = null;
    if (payload.studentId) {
      student = this.prisma.memoryStore.students.get(payload.studentId);
    } else if (payload.identifier) {
      student = Array.from(this.prisma.memoryStore.students.values()).find(
        (s: any) => s.tenantId === tenantId && (s.admissionNumber === payload.identifier || s.id === payload.identifier),
      );
    }

    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student not found for identifier "${payload.identifier || payload.studentId}".`);
    }

    let classId = payload.classId;
    if (!classId) {
      const activeEnr = Array.from(this.prisma.memoryStore.enrollments.values()).find(
        (e: any) => e.tenantId === tenantId && e.studentId === student.id && e.status === 'ACTIVE',
      );
      classId = activeEnr ? activeEnr.classId : student.classId;
    }

    this.logger.log(`External gateway check-in recorded for student ${student.admissionNumber} (${student.id}) from gateway ${payload.deviceId || 'TURNSTILE_01'}`);

    return {
      success: true,
      method: 'EXTERNAL_DEVICE',
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      classId,
      subjectId: payload.subjectId,
      sessionId: payload.sessionId,
      status: payload.status || 'PRESENT',
      timestamp: payload.timestamp || new Date(),
      remarks: payload.remarks || `External Gateway Integration [Gateway: ${payload.deviceId || 'GATEWAY'}]`,
      message: 'External device check-in recorded successfully',
    };
  }
}
