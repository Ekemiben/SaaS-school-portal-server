import { AttendanceMethodType, AttendanceStatusType } from '../dto/mark-attendance.dto.js';

export interface AttendanceCheckInPayload {
  studentId?: string;
  identifier?: string; // Card UID, Biometric hash, QR token, etc.
  classId?: string;
  subjectId?: string;
  sessionId?: string;
  campusId?: string;
  timestamp?: Date;
  status?: AttendanceStatusType;
  remarks?: string;
  deviceId?: string;
  metadata?: Record<string, any>;
}

export interface AttendanceCheckInResult {
  success: boolean;
  method: AttendanceMethodType;
  studentId: string;
  studentName?: string;
  classId?: string;
  subjectId?: string;
  sessionId?: string;
  status: AttendanceStatusType;
  timestamp: Date;
  remarks?: string;
  message?: string;
}

export interface DeviceAdapterInterface {
  readonly method: AttendanceMethodType;
  isAvailable(tenantId: string): Promise<boolean>;
  processCheckIn(
    tenantId: string,
    actorUserId: string,
    payload: AttendanceCheckInPayload,
  ): Promise<AttendanceCheckInResult>;
}
