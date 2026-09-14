import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { StudentsModule } from '../src/modules/students/students.module.js';
import { StudentProgressionService } from '../src/modules/students/services/student-progression.service.js';
import { StudentEnrollmentService } from '../src/modules/students/services/student-enrollment.service.js';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

describe('TASK 25: Students — Class Progression, Promotion Engine & Batch Rollback', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let progressionService: StudentProgressionService;
  let enrollmentService: StudentEnrollmentService;

  const tenantId = 'tenant_prog_test';
  const campusId = 'campus_prog_test';
  const ay2025 = 'ay_2025_2026';
  const ay2026 = 'ay_2026_2027';
  const classGrade7 = 'cls_grade_7';
  const classGrade8 = 'cls_grade_8';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, StudentsModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    progressionService = moduleRef.get<StudentProgressionService>(StudentProgressionService);
    enrollmentService = moduleRef.get<StudentEnrollmentService>(StudentEnrollmentService);

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Premier British Academy',
    });
    prisma.memoryStore.campuses.set(campusId, {
      id: campusId,
      tenantId,
      name: 'Main Campus',
    });
    prisma.memoryStore.academicYears.set(ay2025, {
      id: ay2025,
      tenantId,
      name: '2025/2026',
      status: 'ACTIVE',
    });
    prisma.memoryStore.academicYears.set(ay2026, {
      id: ay2026,
      tenantId,
      name: '2026/2027',
      status: 'UPCOMING',
    });
    prisma.memoryStore.classes.set(classGrade7, {
      id: classGrade7,
      tenantId,
      campusId,
      name: 'Grade 7',
    });
    prisma.memoryStore.classes.set(classGrade8, {
      id: classGrade8,
      tenantId,
      campusId,
      name: 'Grade 8',
    });
  });

  async function seedStudent(name: string, roll: string) {
    const res = await enrollmentService.directEnroll(tenantId, 'admin_1', {
      campusId,
      classId: classGrade7,
      academicYearId: ay2025,
      firstName: name,
      lastName: 'Student',
      dateOfBirth: '2013-05-10',
      gender: 'MALE',
      parentFirstName: 'Parent',
      parentLastName: 'Guardian',
      parentEmail: `${name.toLowerCase()}@guardian.ng`,
      rollNumber: roll,
    });
    return res.student;
  }

  it('should promote an individual student and close previous enrollment', async () => {
    const student = await seedStudent('Ada', '01');

    const result = await progressionService.promoteStudent(tenantId, student.id, 'admin_user_1', {
      targetClassId: classGrade8,
      targetAcademicYearId: ay2026,
      promotionType: 'PROMOTED',
      rollNumber: '08-01',
      reason: 'Passed end-of-year exams',
    });

    expect(result.newEnrollment).toBeDefined();
    expect(result.newEnrollment.classId).toBe(classGrade8);
    expect(result.newEnrollment.academicYearId).toBe(ay2026);
    expect(result.newEnrollment.status).toBe('ACTIVE');

    // Prior enrollment should be marked PROMOTED with completedAt
    const allEnr = Array.from(prisma.memoryStore.enrollments.values()).filter(
      (e: any) => e.studentId === student.id,
    );
    expect(allEnr.length).toBe(2);

    const oldEnr = allEnr.find((e: any) => e.classId === classGrade7);
    expect(oldEnr.status).toBe('PROMOTED');
    expect(oldEnr.completedAt).toBeDefined();

    // Lifecycle timeline event
    expect(result.lifecycleEvent.eventType).toBe('PROMOTION');
    expect(result.lifecycleEvent.fromClassId).toBe(classGrade7);
    expect(result.lifecycleEvent.toClassId).toBe(classGrade8);
  });

  it('should handle repetition for a student', async () => {
    const student = await seedStudent('Bayo', '02');

    const result = await progressionService.promoteStudent(tenantId, student.id, 'admin_user_1', {
      targetClassId: classGrade7,
      targetAcademicYearId: ay2026,
      promotionType: 'REPEATED',
      reason: 'Academic remediation required',
    });

    expect(result.newEnrollment.classId).toBe(classGrade7);
    expect(result.newEnrollment.academicYearId).toBe(ay2026);
    expect(result.lifecycleEvent.eventType).toBe('DEMOTION');

    const allEnr = Array.from(prisma.memoryStore.enrollments.values()).filter(
      (e: any) => e.studentId === student.id,
    );
    const oldEnr = allEnr.find((e: any) => e.academicYearId === ay2025);
    expect(oldEnr.status).toBe('REPEATED');
  });

  it('should execute batch promotion for entire class and allow batch rollback', async () => {
    const s1 = await seedStudent('Chinedu', '03');
    const s2 = await seedStudent('Dapo', '04');
    const s3 = await seedStudent('Eunice', '05');

    const batchResult = await progressionService.batchPromoteClass(tenantId, 'admin_user_1', {
      sourceClassId: classGrade7,
      sourceAcademicYearId: ay2025,
      defaultTargetClassId: classGrade8,
      targetAcademicYearId: ay2026,
      promotionRule: 'MERIT_BASED',
      studentDecisions: [
        { studentId: s1.id, decision: 'PROMOTED', targetClassId: classGrade8 },
        { studentId: s2.id, decision: 'REPEATED', targetClassId: classGrade7, notes: 'Below cutoff' },
        { studentId: s3.id, decision: 'ON_PROBATION', targetClassId: classGrade8 },
      ],
    });

    expect(batchResult.batch).toBeDefined();
    expect(batchResult.batch.totalStudents).toBe(3);
    expect(batchResult.batch.promotedCount).toBe(2);
    expect(batchResult.batch.repeatedCount).toBe(1);
    expect(batchResult.batch.status).toBe('COMPLETED');

    // Verify s1 is in Grade 8
    const s1Enr = Array.from(prisma.memoryStore.enrollments.values()).find(
      (e: any) => e.studentId === s1.id && e.status === 'ACTIVE',
    );
    expect(s1Enr.classId).toBe(classGrade8);

    // Verify s2 is repeating Grade 7
    const s2Enr = Array.from(prisma.memoryStore.enrollments.values()).find(
      (e: any) => e.studentId === s2.id && e.status === 'ACTIVE',
    );
    expect(s2Enr.classId).toBe(classGrade7);
    expect(s2Enr.academicYearId).toBe(ay2026);

    // Rollback promotion batch
    const revertResult = await progressionService.revertPromotionBatch(tenantId, 'admin_user_1', {
      batchId: batchResult.batch.id,
      reason: 'Administrative correction in grade cutoffs',
    });

    expect(revertResult.revertedBatch.status).toBe('REVERTED');
    expect(revertResult.revertedEnrollmentsCount).toBe(3);

    // Verify s1 active enrollment is restored to Grade 7 in ay2025
    const s1Restored = Array.from(prisma.memoryStore.enrollments.values()).find(
      (e: any) => e.studentId === s1.id && e.status === 'ACTIVE',
    );
    expect(s1Restored.classId).toBe(classGrade7);
    expect(s1Restored.academicYearId).toBe(ay2025);
  });
});
