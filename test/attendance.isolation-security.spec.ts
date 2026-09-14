import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { AttendanceModule } from '../src/modules/attendance/attendance.module.js';
import { AttendanceCoreService } from '../src/modules/attendance/services/attendance-core.service.js';
import { AttendanceSessionService } from '../src/modules/attendance/services/attendance-session.service.js';
import { AttendanceReportService } from '../src/modules/attendance/services/attendance-report.service.js';
import { AttendanceConfigService } from '../src/modules/attendance/services/attendance-config.service.js';
import { ConfigModule } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';

describe('TASK 26: Attendance — Multi-Tenant Isolation & Security Boundaries', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let coreService: AttendanceCoreService;
  let sessionService: AttendanceSessionService;
  let reportService: AttendanceReportService;
  let configService: AttendanceConfigService;

  const tenantAlpha = 'tenant_att_iso_alpha';
  const tenantBeta = 'tenant_att_iso_beta';

  const campusAlpha = 'campus_att_iso_alpha';
  const campusBeta = 'campus_att_iso_beta';

  const classAlpha = 'cls_att_iso_alpha';
  const classBeta = 'cls_att_iso_beta';

  const studentAlpha = 'std_att_iso_alpha';
  const studentBeta = 'std_att_iso_beta';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, AttendanceModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    coreService = moduleRef.get<AttendanceCoreService>(AttendanceCoreService);
    sessionService = moduleRef.get<AttendanceSessionService>(AttendanceSessionService);
    reportService = moduleRef.get<AttendanceReportService>(AttendanceReportService);
    configService = moduleRef.get<AttendanceConfigService>(AttendanceConfigService);

    // Tenant Alpha
    prisma.memoryStore.tenants.set(tenantAlpha, { id: tenantAlpha, name: 'Alpha Academy' });
    prisma.memoryStore.campuses.set(campusAlpha, { id: campusAlpha, tenantId: tenantAlpha, name: 'Alpha Campus' });
    prisma.memoryStore.classes.set(classAlpha, { id: classAlpha, tenantId: tenantAlpha, campusId: campusAlpha, name: 'Alpha Class 1' });
    prisma.memoryStore.students.set(studentAlpha, {
      id: studentAlpha,
      tenantId: tenantAlpha,
      campusId: campusAlpha,
      classId: classAlpha,
      firstName: 'Alpha',
      lastName: 'Student',
      admissionNumber: 'SCH/2026/A001',
      status: 'ACTIVE',
    });

    // Tenant Beta
    prisma.memoryStore.tenants.set(tenantBeta, { id: tenantBeta, name: 'Beta Grammar' });
    prisma.memoryStore.campuses.set(campusBeta, { id: campusBeta, tenantId: tenantBeta, name: 'Beta Campus' });
    prisma.memoryStore.classes.set(classBeta, { id: classBeta, tenantId: tenantBeta, campusId: campusBeta, name: 'Beta Class 1' });
    prisma.memoryStore.students.set(studentBeta, {
      id: studentBeta,
      tenantId: tenantBeta,
      campusId: campusBeta,
      classId: classBeta,
      firstName: 'Beta',
      lastName: 'Student',
      admissionNumber: 'SCH/2026/B001',
      status: 'ACTIVE',
    });
  });

  it('should prevent Tenant Beta from marking attendance for Tenant Alpha class or student', async () => {
    // Cross-tenant class
    await expect(
      coreService.markAttendance(tenantBeta, campusBeta, 'teacher_beta', {
        classId: classAlpha, // Alpha class
        date: '2026-09-14',
        records: [{ studentId: studentBeta, status: 'PRESENT' }],
      }),
    ).rejects.toThrow(NotFoundException);

    // Cross-tenant student
    await expect(
      coreService.markAttendance(tenantBeta, campusBeta, 'teacher_beta', {
        classId: classBeta,
        date: '2026-09-14',
        records: [{ studentId: studentAlpha, status: 'PRESENT' }], // Alpha student
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should prevent Tenant Beta from reading Tenant Alpha attendance records or reports', async () => {
    // Record attendance in Alpha
    await coreService.markAttendance(tenantAlpha, campusAlpha, 'teacher_alpha', {
      classId: classAlpha,
      date: '2026-09-14',
      records: [{ studentId: studentAlpha, status: 'PRESENT' }],
    });

    // Beta queries records -> empty
    const betaRecords = await coreService.getAttendanceRecords(tenantBeta, { date: '2026-09-14' });
    expect(betaRecords).toHaveLength(0);

    // Beta requests Alpha class report -> NotFoundException
    await expect(
      reportService.getDailyClassReport(tenantBeta, classAlpha, '2026-09-14'),
    ).rejects.toThrow(NotFoundException);

    // Beta requests Alpha student history -> NotFoundException
    await expect(
      reportService.getStudentAttendanceHistory(tenantBeta, studentAlpha),
    ).rejects.toThrow(NotFoundException);
  });

  it('should prevent cross-tenant QR session validation and check-in', async () => {
    await configService.updateConfig(tenantAlpha, { qrEnabled: true });
    await configService.updateConfig(tenantBeta, { qrEnabled: true });
    const alphaSession = await sessionService.createSession(tenantAlpha, campusAlpha, 'teacher_alpha', {
      classId: classAlpha,
      title: 'Alpha Morning Session',
      date: '2026-09-14',
    });
    const qrData = await sessionService.generateQrToken(tenantAlpha, alphaSession.id, 'teacher_alpha');

    // Beta student attempts to check in to Alpha session
    await expect(
      sessionService.processQrCheckIn(tenantBeta, studentBeta, {
        sessionId: alphaSession.id,
        qrToken: qrData.qrToken,
        studentId: studentBeta,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should prevent Tenant Beta from modifying or correcting Tenant Alpha attendance records', async () => {
    const markRes = await coreService.markAttendance(tenantAlpha, campusAlpha, 'teacher_alpha', {
      classId: classAlpha,
      date: '2026-09-14',
      records: [{ studentId: studentAlpha, status: 'ABSENT' }],
    });
    const alphaRecordId = markRes.records[0].id;

    await expect(
      coreService.correctAttendance(tenantBeta, alphaRecordId, 'principal_beta', {
        status: 'EXCUSED',
        reason: 'Unauthorized cross-tenant correction',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
