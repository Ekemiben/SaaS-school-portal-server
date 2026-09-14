import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { AttendanceModule } from '../src/modules/attendance/attendance.module.js';
import { AttendanceSessionService } from '../src/modules/attendance/services/attendance-session.service.js';
import { AttendanceConfigService } from '../src/modules/attendance/services/attendance-config.service.js';
import { AttendanceCoreService } from '../src/modules/attendance/services/attendance-core.service.js';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

describe('TASK 26: Attendance — Optional QR & Device Integration Adapters', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let sessionService: AttendanceSessionService;
  let configService: AttendanceConfigService;
  let coreService: AttendanceCoreService;

  const tenantId = 'tenant_att_devices';
  const campusId = 'campus_att_device';
  const classId = 'cls_grade9_b';
  const studentId = 'std_qr_001';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, AttendanceModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    sessionService = moduleRef.get<AttendanceSessionService>(AttendanceSessionService);
    configService = moduleRef.get<AttendanceConfigService>(AttendanceConfigService);
    coreService = moduleRef.get<AttendanceCoreService>(AttendanceCoreService);

    prisma.memoryStore.tenants.set(tenantId, { id: tenantId, name: 'Atlantic Hall' });
    prisma.memoryStore.campuses.set(campusId, { id: campusId, tenantId, name: 'Epe Campus' });
    prisma.memoryStore.classes.set(classId, { id: classId, tenantId, campusId, name: 'Grade 9 Beta' });

    prisma.memoryStore.students.set(studentId, {
      id: studentId,
      tenantId,
      campusId,
      classId,
      firstName: 'Simi',
      lastName: 'Ogunleye',
      admissionNumber: 'SCH/2026/0201',
      rfidCardUid: 'RFID_CARD_SIMI_99',
      biometricHash: 'BIO_HASH_SIMI_77',
      status: 'ACTIVE',
    });
  });

  it('should prevent QR token generation if school has QR attendance disabled', async () => {
    const session = await sessionService.createSession(tenantId, campusId, 'teacher_1', {
      classId,
      title: 'Morning Homeroom',
      date: '2026-09-14',
    });

    // Default configuration has qrEnabled: false
    await expect(
      sessionService.generateQrToken(tenantId, session.id, 'teacher_1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should generate dynamic short-lived QR token and verify student check-in when QR is enabled', async () => {
    // Enable QR in settings
    await configService.updateConfig(tenantId, { qrEnabled: true, qrTokenExpirySeconds: 60 });

    const session = await sessionService.createSession(tenantId, campusId, 'teacher_1', {
      classId,
      title: 'Morning Assembly Check-in',
      date: '2026-09-14',
    });

    const qrData = await sessionService.generateQrToken(tenantId, session.id, 'teacher_1', { expirySeconds: 60 });
    expect(qrData.qrToken).toMatch(/^qr_[a-f0-9]{32}$/);
    expect(qrData.expirySeconds).toBe(60);

    // Student scans QR
    const checkInResult = await sessionService.processQrCheckIn(tenantId, studentId, {
      sessionId: session.id,
      qrToken: qrData.qrToken,
      studentId,
    });

    expect(checkInResult.success).toBe(true);
    expect(checkInResult.method).toBe('QR');
    expect(checkInResult.studentId).toBe(studentId);

    // Verify closing session prevents further QR check-in
    await sessionService.closeSession(tenantId, session.id, 'teacher_1');
    await expect(
      sessionService.processQrCheckIn(tenantId, studentId, {
        sessionId: session.id,
        qrToken: qrData.qrToken,
        studentId,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should support RFID card check-in when enabled and gracefully reject when disabled', async () => {
    // 1. Attempt RFID check-in when rfidEnabled: false -> rejected
    await expect(
      coreService.recordDeviceCheckIn(tenantId, 'sys_rfid_gateway', {
        campusId,
        method: 'RFID',
        identifier: 'RFID_CARD_SIMI_99',
      }),
    ).rejects.toThrow(BadRequestException);

    // 2. Enable RFID
    await configService.updateConfig(tenantId, { rfidEnabled: true });

    const checkInRes = await coreService.recordDeviceCheckIn(tenantId, 'sys_rfid_gateway', {
      campusId,
      method: 'RFID',
      identifier: 'RFID_CARD_SIMI_99',
      deviceId: 'GATE_TURNSTILE_01',
    });

    expect(checkInRes.success).toBe(true);
    expect(checkInRes.count).toBe(1);
    expect(checkInRes.records[0].method).toBe('RFID');
    expect(checkInRes.records[0].studentId).toBe(studentId);
  });

  it('should support Biometric verification boundary when enabled and reject when disabled', async () => {
    // 1. Disabled
    await expect(
      coreService.recordDeviceCheckIn(tenantId, 'sys_bio_terminal', {
        campusId,
        method: 'BIOMETRIC',
        identifier: 'BIO_HASH_SIMI_77',
      }),
    ).rejects.toThrow(BadRequestException);

    // 2. Enable Biometric
    await configService.updateConfig(tenantId, { biometricEnabled: true });

    const checkInRes = await coreService.recordDeviceCheckIn(tenantId, 'sys_bio_terminal', {
      campusId,
      method: 'BIOMETRIC',
      identifier: 'BIO_HASH_SIMI_77',
      deviceId: 'TERMINAL_MAIN_HALL',
    });

    expect(checkInRes.success).toBe(true);
    expect(checkInRes.records[0].method).toBe('BIOMETRIC');
    expect(checkInRes.records[0].studentId).toBe(studentId);
  });
});
