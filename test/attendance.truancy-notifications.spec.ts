import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { AttendanceModule } from '../src/modules/attendance/attendance.module.js';
import { AttendanceCoreService } from '../src/modules/attendance/services/attendance-core.service.js';
import { AttendanceConfigService } from '../src/modules/attendance/services/attendance-config.service.js';
import { AttendanceReportService } from '../src/modules/attendance/services/attendance-report.service.js';
import { BullmqService } from '../src/jobs/bullmq.service.js';
import { ConfigModule } from '@nestjs/config';

describe('TASK 26: Attendance — Truancy Engine, Fault-Isolated Alerts & Config', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let coreService: AttendanceCoreService;
  let configService: AttendanceConfigService;
  let reportService: AttendanceReportService;
  let bullmqService: BullmqService;

  const tenantId = 'tenant_att_truancy';
  const campusId = 'campus_truancy_main';
  const classId = 'cls_grade10_c';
  const studentId = 'std_truant_001';
  const parentId = 'prt_truant_001';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, AttendanceModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    coreService = moduleRef.get<AttendanceCoreService>(AttendanceCoreService);
    configService = moduleRef.get<AttendanceConfigService>(AttendanceConfigService);
    reportService = moduleRef.get<AttendanceReportService>(AttendanceReportService);
    bullmqService = moduleRef.get<BullmqService>(BullmqService);

    prisma.memoryStore.tenants.set(tenantId, { id: tenantId, name: 'Grange School' });
    prisma.memoryStore.campuses.set(campusId, { id: campusId, tenantId, name: 'Ikeja Campus' });
    prisma.memoryStore.classes.set(classId, { id: classId, tenantId, campusId, name: 'Grade 10 C' });

    prisma.memoryStore.parents.set(parentId, {
      id: parentId,
      tenantId,
      firstName: 'Alhaji',
      lastName: 'Dikko',
      phone: '+2348033334444',
      email: 'dikko@example.ng',
    });

    prisma.memoryStore.students.set(studentId, {
      id: studentId,
      tenantId,
      campusId,
      classId,
      parentId,
      firstName: 'Farouk',
      lastName: 'Dikko',
      admissionNumber: 'SCH/2026/0301',
      status: 'ACTIVE',
    });
  });

  it('should detect consecutive absences and trigger TruancyIncident when threshold is reached', async () => {
    // School configuration: consecutive absence threshold = 3
    await configService.updateConfig(tenantId, {
      consecutiveAbsenceThreshold: 3,
      autoNotifyParentsOnTruancy: true,
    });

    // Day 1: Absent
    await coreService.markAttendance(tenantId, campusId, 'teacher_1', {
      classId,
      date: '2026-09-10',
      sessionType: 'DAILY',
      records: [{ studentId, status: 'ABSENT', remarks: 'Unexcused' }],
    });

    // Day 2: Absent
    await coreService.markAttendance(tenantId, campusId, 'teacher_1', {
      classId,
      date: '2026-09-11',
      sessionType: 'DAILY',
      records: [{ studentId, status: 'ABSENT', remarks: 'Unexcused' }],
    });

    // Check truancy incidents before threshold
    let incidents = await reportService.getTruancySummary(tenantId);
    expect(incidents).toHaveLength(0);

    // Day 3: Absent (Hits threshold of 3)
    await coreService.markAttendance(tenantId, campusId, 'teacher_1', {
      classId,
      date: '2026-09-12',
      sessionType: 'DAILY',
      records: [{ studentId, status: 'ABSENT', remarks: 'Unexcused' }],
    });

    incidents = await reportService.getTruancySummary(tenantId);
    expect(incidents.length).toBeGreaterThanOrEqual(1);
    expect(incidents[0].studentId).toBe(studentId);
    expect(incidents[0].incidentType).toBe('CONSECUTIVE_ABSENCE');
    expect(incidents[0].triggerValue).toBe(3);
    expect(incidents[0].thresholdValue).toBe(3);
  });

  it('should preserve attendance records even if background notification dispatch fails (Fault Isolation)', async () => {
    // Mock bullmqService dispatch to throw an error simulating SMS gateway outage
    const dispatchSpy = vi.spyOn(bullmqService, 'dispatch').mockRejectedValueOnce(new Error('SMS Gateway 503 Service Unavailable'));

    const result = await coreService.markAttendance(tenantId, campusId, 'teacher_1', {
      classId,
      date: '2026-09-14',
      sessionType: 'DAILY',
      records: [{ studentId, status: 'ABSENT', remarks: 'Illness' }],
    });

    // Attendance record MUST be saved successfully despite notification failure
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    const saved = await coreService.getAttendanceRecords(tenantId, { studentId, date: '2026-09-14' });
    expect(saved).toHaveLength(1);
    expect(saved[0].status).toBe('ABSENT');

    dispatchSpy.mockRestore();
  });

  it('should allow tenant to configure attendance methods and warning thresholds', async () => {
    const updatedConfig = await configService.updateConfig(tenantId, {
      manualEnabled: true,
      qrEnabled: true,
      rfidEnabled: false,
      consecutiveAbsenceThreshold: 4,
      lowAttendancePercentageThreshold: 80.0,
      preferredNotificationChannel: 'SMS',
    });

    expect(updatedConfig.qrEnabled).toBe(true);
    expect(updatedConfig.rfidEnabled).toBe(false);
    expect(updatedConfig.consecutiveAbsenceThreshold).toBe(4);
    expect(updatedConfig.lowAttendancePercentageThreshold).toBe(80.0);

    const fetched = await configService.getConfig(tenantId);
    expect(fetched.consecutiveAbsenceThreshold).toBe(4);
  });
});
