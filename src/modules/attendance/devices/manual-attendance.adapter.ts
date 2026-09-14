import { Injectable, BadRequestException } from '@nestjs/common';
import { DeviceAdapterInterface, AttendanceCheckInPayload, AttendanceCheckInResult } from './device-adapter.interface.js';
import { AttendanceMethodType } from '../dto/mark-attendance.dto.js';

@Injectable()
export class ManualAttendanceAdapter implements DeviceAdapterInterface {
  readonly method: AttendanceMethodType = 'MANUAL';

  async isAvailable(_tenantId: string): Promise<boolean> {
    // Manual attendance is the universal baseline and is ALWAYS available
    return true;
  }

  async processCheckIn(
    _tenantId: string,
    _actorUserId: string,
    payload: AttendanceCheckInPayload,
  ): Promise<AttendanceCheckInResult> {
    if (!payload.studentId) {
      throw new BadRequestException('studentId is required for manual attendance check-in');
    }

    return {
      success: true,
      method: 'MANUAL',
      studentId: payload.studentId,
      classId: payload.classId,
      subjectId: payload.subjectId,
      sessionId: payload.sessionId,
      status: payload.status || 'PRESENT',
      timestamp: payload.timestamp || new Date(),
      remarks: payload.remarks,
      message: 'Manual attendance processed successfully',
    };
  }
}
