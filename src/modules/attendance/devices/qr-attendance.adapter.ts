import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DeviceAdapterInterface, AttendanceCheckInPayload, AttendanceCheckInResult } from './device-adapter.interface.js';
import { AttendanceMethodType } from '../dto/mark-attendance.dto.js';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class QrAttendanceAdapter implements DeviceAdapterInterface {
  readonly method: AttendanceMethodType = 'QR';

  constructor(private readonly prisma: PrismaService) {}

  async isAvailable(tenantId: string): Promise<boolean> {
    const config = await this.prisma.attendanceConfig.findUnique({
      where: { tenantId },
    });
    return config ? !!config.qrEnabled : false;
  }

  async processCheckIn(
    tenantId: string,
    _actorUserId: string,
    payload: AttendanceCheckInPayload,
  ): Promise<AttendanceCheckInResult> {
    const isEnabled = await this.isAvailable(tenantId);
    if (!isEnabled) {
      throw new BadRequestException('QR attendance is not enabled for this school.');
    }

    if (!payload.sessionId) {
      throw new BadRequestException('sessionId is required for QR attendance.');
    }

    if (!payload.identifier) {
      throw new BadRequestException('QR token is required for QR attendance check-in.');
    }

    if (!payload.studentId) {
      throw new BadRequestException('studentId is required for QR attendance check-in.');
    }

    const session = await this.prisma.attendanceSession.findFirst({
      where: { id: payload.sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException(`Attendance session ${payload.sessionId} not found.`);
    }

    if (session.status !== 'OPEN') {
      throw new BadRequestException(`Attendance session is ${session.status}. QR check-in is not permitted.`);
    }

    if (!session.qrToken || session.qrToken !== payload.identifier) {
      throw new BadRequestException('Invalid or expired QR token provided.');
    }

    if (session.qrExpiresAt && new Date() > new Date(session.qrExpiresAt)) {
      throw new BadRequestException('QR token has expired. Please refresh the teacher display.');
    }

    const student = await this.prisma.student.findFirst({
      where: { id: payload.studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException(`Student ${payload.studentId} not found in this school.`);
    }

    return {
      success: true,
      method: 'QR',
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      classId: session.classId,
      subjectId: session.subjectId || undefined,
      sessionId: session.id,
      status: payload.status || 'PRESENT',
      timestamp: new Date(),
      remarks: payload.remarks || 'Scanned session QR code',
      message: 'QR code attendance verified successfully',
    };
  }
}
