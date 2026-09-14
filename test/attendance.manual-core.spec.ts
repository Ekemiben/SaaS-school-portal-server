import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { AttendanceModule } from '../src/modules/attendance/attendance.module.js';
import { AttendanceCoreService } from '../src/modules/attendance/services/attendance-core.service.js';
import { AttendanceReportService } from '../src/modules/attendance/services/attendance-report.service.js';
import { ConfigModule } from '@nestjs/config';

describe('TASK 26: Attendance — Manual Core, Subject & Session Attendance', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let coreService: AttendanceCoreService;
  let reportService: AttendanceReportService;

  const tenantId = 'tenant_att_core';
  const campusId = 'campus_att_main';
  const classId = 'cls_grade8_a';
  const subjectMath = 'sub_math_g8';
  const student1 = 'std_att_001';
  const student2 = 'std_att_002';
  const student3 = 'std_att_003';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, AttendanceModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    coreService = moduleRef.get<AttendanceCoreService>(AttendanceCoreService);
    reportService = moduleRef.get<AttendanceReportService>(AttendanceReportService);

    // Seed tenant, campus, class, subject, students
    prisma.memoryStore.tenants.set(tenantId, { id: tenantId, name: 'Corona Secondary School' });
    prisma.memoryStore.campuses.set(campusId, { id: campusId, tenantId, name: 'Lekki Campus' });
    prisma.memoryStore.classes.set(classId, { id: classId, tenantId, campusId, name: 'Grade 8 Alpha' });
    prisma.memoryStore.subjects.set(subjectMath, { id: subjectMath, tenantId, code: 'MTH8', name: 'Mathematics' });

    prisma.memoryStore.students.set(student1, {
      id: student1,
      tenantId,
      campusId,
      classId,
      firstName: 'David',
      lastName: 'Adeleke',
      admissionNumber: 'SCH/2026/0101',
      status: 'ACTIVE',
    });
    prisma.memoryStore.students.set(student2, {
      id: student2,
      tenantId,
      campusId,
      classId,
      firstName: 'Funke',
      lastName: 'Akindele',
      admissionNumber: 'SCH/2026/0102',
      status: 'ACTIVE',
    });
    prisma.memoryStore.students.set(student3, {
      id: student3,
      tenantId,
      campusId,
      classId,
      firstName: 'Tobi',
      lastName: 'Amusan',
      admissionNumber: 'SCH/2026/0103',
      status: 'ACTIVE',
    });
  });

  it('should mark daily attendance for an entire class without requiring any physical hardware', async () => {
    const today = '2026-09-14';

    const result = await coreService.markAttendance(tenantId, campusId, 'teacher_user_1', {
      classId,
      date: today,
      sessionType: 'DAILY',
      method: 'MANUAL',
      records: [
        { studentId: student1, status: 'PRESENT' },
        { studentId: student2, status: 'ABSENT', remarks: 'Medical leave' },
        { studentId: student3, status: 'LATE', remarks: 'Traffic delay' },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);

    // Verify daily report
    const report = await reportService.getDailyClassReport(tenantId, classId, today);
    expect(report.totalStudentsRecorded).toBe(3);
    expect(report.presentCount).toBe(1);
    expect(report.absentCount).toBe(1);
    expect(report.lateCount).toBe(1);
    expect(report.attendanceRate).toBe(67); // (1 present + 1 late) / 3 = 67%
  });

  it('should support subject-level attendance without overwriting daily attendance records', async () => {
    const date = '2026-09-14';

    // 1. Mark Daily Attendance (Student 1 is PRESENT)
    await coreService.markAttendance(tenantId, campusId, 'teacher_homeroom', {
      classId,
      date,
      sessionType: 'DAILY',
      records: [{ studentId: student1, status: 'PRESENT' }],
    });

    // 2. Mark Mathematics Attendance (Student 1 is ABSENT in period 2)
    await coreService.markAttendance(tenantId, campusId, 'teacher_math', {
      classId,
      subjectId: subjectMath,
      date,
      sessionType: 'SUBJECT_PERIOD',
      records: [{ studentId: student1, status: 'ABSENT', remarks: 'Skipped Math class' }],
    });

    // Check all attendance for Student 1
    const allRecords = await coreService.getAttendanceRecords(tenantId, { studentId: student1, date });
    expect(allRecords).toHaveLength(2);

    const dailyRecord = allRecords.find((r) => r.sessionType === 'DAILY');
    expect(dailyRecord?.status).toBe('PRESENT');

    const subjectRecord = allRecords.find((r) => r.subjectId === subjectMath);
    expect(subjectRecord?.status).toBe('ABSENT');
    expect(subjectRecord?.remarks).toBe('Skipped Math class');
  });

  it('should update records idempotently when marked multiple times for the same scope', async () => {
    const date = '2026-09-14';

    // First submission
    await coreService.markAttendance(tenantId, campusId, 'teacher_1', {
      classId,
      date,
      sessionType: 'DAILY',
      records: [{ studentId: student1, status: 'ABSENT' }],
    });

    // Second submission (correction on same day/session)
    await coreService.markAttendance(tenantId, campusId, 'teacher_1', {
      classId,
      date,
      sessionType: 'DAILY',
      records: [{ studentId: student1, status: 'PRESENT', remarks: 'Arrived after roll call' }],
    });

    const records = await coreService.getAttendanceRecords(tenantId, { studentId: student1, date, sessionType: 'DAILY' });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('PRESENT');
    expect(records[0].remarks).toBe('Arrived after roll call');
  });

  it('should audit attendance corrections with previous and new status', async () => {
    const date = '2026-09-14';

    const markRes = await coreService.markAttendance(tenantId, campusId, 'teacher_1', {
      classId,
      date,
      sessionType: 'DAILY',
      records: [{ studentId: student2, status: 'ABSENT' }],
    });
    const recordId = markRes.records[0].id;

    // Apply correction
    const correctRes = await coreService.correctAttendance(tenantId, recordId, 'principal_1', {
      status: 'EXCUSED',
      reason: 'Parent provided official doctor letter',
    });

    expect(correctRes.record.status).toBe('EXCUSED');
    expect(correctRes.correction).toBeDefined();
    expect(correctRes.correction.previousStatus).toBe('ABSENT');
    expect(correctRes.correction.newStatus).toBe('EXCUSED');
    expect(correctRes.correction.reason).toContain('doctor letter');

    // Verify audit record exists in memory store
    const audit = prisma.memoryStore.attendanceCorrections.get(correctRes.correction.id);
    expect(audit).toBeDefined();
    expect(audit.changedByUserId).toBe('principal_1');
  });
});
