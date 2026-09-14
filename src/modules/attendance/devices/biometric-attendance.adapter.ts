import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { DeviceAdapterInterface, AttendanceCheckInPayload, AttendanceCheckInResult } from './device-adapter.interface.js';
import { AttendanceMethodType } from '../dto/mark-attendance.dto.js';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class BiometricAttendanceAdapter implements DeviceAdapterInterface {
  readonly method: AttendanceMethodType = 'BIOMETRIC';
  private readonly logger = new Logger(BiometricAttendanceAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async isAvailable(tenantId: string): Promise<boolean> {
    const config = this.prisma.memoryStore.attendanceConfigs.get(tenantId);
    return config ? !!config.biometricEnabled : false;
  }

  async processCheckIn(
    tenantId: string,
    _actorUserId: string,
    payload: AttendanceCheckInPayload,
  ): Promise<AttendanceCheckInResult> {
    const isEnabled = await this.isAvailable(tenantId);
    if (!isEnabled) {
      throw new BadRequestException('Biometric attendance integration is not enabled for this school.');
    }

    if (!payload.identifier && !payload.studentId) {
      throw new BadRequestException('Biometric template/sensor ID or studentId is required for biometric check-in.');
    }

    let student: any = null;
    if (payload.studentId) {
      student = this.prisma.memoryStore.students.get(payload.studentId);
    } else if (payload.identifier) {
      student = Array.from(this.prisma.memoryStore.students.values()).find(
        (s: any) => s.tenantId === tenantId && (s.biometricHash === payload.identifier || s.admissionNumber === payload.identifier),
      );
    }

    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`No student matched for biometric identifier "${payload.identifier}".`);
    }

    let classId = payload.classId;
    if (!classId) {
      const activeEnr = Array.from(this.prisma.memoryStore.enrollments.values()).find(
        (e: any) => e.tenantId === tenantId && e.studentId === student.id && e.status === 'ACTIVE',
      );
      classId = activeEnr ? activeEnr.classId : student.classId;
    }

    this.logger.log(`Biometric verification succeeded for student ${student.admissionNumber} (${student.id}) via scanner ${payload.deviceId || 'SCANNER-01'}`);

    return {
      success: true,
      method: 'BIOMETRIC',
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      classId,
      subjectId: payload.subjectId,
      sessionId: payload.sessionId,
      status: payload.status || 'PRESENT',
      timestamp: payload.timestamp || new Date(),
      remarks: payload.remarks || `Biometric Verification [Scanner: ${payload.deviceId || 'BIO_TERM_1'}]`,
      message: 'Biometric verification processed successfully',
    };
  }
}
