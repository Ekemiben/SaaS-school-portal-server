import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { StudentsModule } from '../src/modules/students/students.module.js';
import { StudentTransferService } from '../src/modules/students/services/student-transfer.service.js';
import { StudentLifecycleService } from '../src/modules/students/services/student-lifecycle.service.js';
import { StudentEnrollmentService } from '../src/modules/students/services/student-enrollment.service.js';
import { ConfigModule } from '@nestjs/config';

describe('TASK 25: Students — Transfers, Lifecycle State Machine & Alumni Engine', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let transferService: StudentTransferService;
  let lifecycleService: StudentLifecycleService;
  let enrollmentService: StudentEnrollmentService;

  const tenantId = 'tenant_life_test';
  const campusA = 'campus_alpha';
  const campusB = 'campus_beta';
  const ay2026 = 'ay_2026_life';
  const classScience = 'cls_grade12_sci';
  const classArts = 'cls_grade12_arts';
  const classCampusB = 'cls_campus_b_g12';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, StudentsModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    transferService = moduleRef.get<StudentTransferService>(StudentTransferService);
    lifecycleService = moduleRef.get<StudentLifecycleService>(StudentLifecycleService);
    enrollmentService = moduleRef.get<StudentEnrollmentService>(StudentEnrollmentService);

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Regal International College',
    });
    prisma.memoryStore.campuses.set(campusA, {
      id: campusA,
      tenantId,
      name: 'Main Campus Lekki',
    });
    prisma.memoryStore.campuses.set(campusB, {
      id: campusB,
      tenantId,
      name: 'Ikeja Campus',
    });
    prisma.memoryStore.academicYears.set(ay2026, {
      id: ay2026,
      tenantId,
      name: '2026/2027',
      status: 'ACTIVE',
    });
    prisma.memoryStore.classes.set(classScience, {
      id: classScience,
      tenantId,
      campusId: campusA,
      name: 'Grade 12 Science',
    });
    prisma.memoryStore.classes.set(classArts, {
      id: classArts,
      tenantId,
      campusId: campusA,
      name: 'Grade 12 Arts',
    });
    prisma.memoryStore.classes.set(classCampusB, {
      id: classCampusB,
      tenantId,
      campusId: campusB,
      name: 'Grade 12 Ikeja',
    });
  });

  async function seedStudent(firstName: string, lastName: string) {
    const res = await enrollmentService.directEnroll(tenantId, 'admin_1', {
      campusId: campusA,
      classId: classScience,
      academicYearId: ay2026,
      firstName,
      lastName,
      dateOfBirth: '2008-04-12',
      gender: 'FEMALE',
      parentFirstName: 'Chief',
      parentLastName: lastName,
      parentEmail: `parent.${lastName.toLowerCase()}@example.ng`,
    });
    return res.student;
  }

  it('should transfer student from one class to another within the same session', async () => {
    const student = await seedStudent('Folashade', 'Adeyemi');

    const result = await transferService.transferClass(tenantId, student.id, 'admin_1', {
      targetClassId: classArts,
      reason: 'Switched focus to humanities',
    });

    expect(result.newEnrollment.classId).toBe(classArts);
    expect(result.newEnrollment.status).toBe('ACTIVE');

    // Previous enrollment marked TRANSFERRED
    const oldEnr = Array.from(prisma.memoryStore.enrollments.values()).find(
      (e: any) => e.studentId === student.id && e.classId === classScience,
    );
    expect(oldEnr.status).toBe('TRANSFERRED');
    expect(result.lifecycleEvent.eventType).toBe('CLASS_TRANSFER');
  });

  it('should transfer student across campuses', async () => {
    const student = await seedStudent('Ifeanyi', 'Nwachukwu');

    const result = await transferService.transferCampus(tenantId, student.id, 'admin_1', {
      targetCampusId: campusB,
      targetClassId: classCampusB,
      reason: 'Family relocated to Ikeja',
    });

    expect(result.student.campusId).toBe(campusB);
    expect(result.newEnrollment.classId).toBe(classCampusB);
    expect(result.lifecycleEvent.eventType).toBe('CAMPUS_TRANSFER');
  });

  it('should manage suspension and reinstatement lifecycle correctly', async () => {
    const student = await seedStudent('Oluwaseun', 'Balogun');

    // Suspend
    const suspendRes = await lifecycleService.suspendStudent(tenantId, student.id, 'principal_1', {
      reason: 'Disciplinary hearing pending',
      endDate: '2026-10-01',
    });
    expect(suspendRes.student.status).toBe('SUSPENDED');
    expect(suspendRes.lifecycleEvent.eventType).toBe('SUSPENSION');

    // Reinstate
    const reinstateRes = await lifecycleService.reinstateStudent(tenantId, student.id, 'principal_1', {
      reason: 'Disciplinary board cleared student',
    });
    expect(reinstateRes.student.status).toBe('ACTIVE');
    expect(reinstateRes.lifecycleEvent.eventType).toBe('REINSTATEMENT');
  });

  it('should graduate student and archive into Alumni registry', async () => {
    const student = await seedStudent('Tari', 'Briggs');

    const gradRes = await lifecycleService.graduateStudent(tenantId, student.id, 'admin_1', {
      graduationDate: '2026-07-15',
      graduationYear: 2026,
      finalGrade: 'First Class Honors / Valedictorian',
      honors: 'Best Graduating Student in Sciences',
    });

    expect(gradRes.student.status).toBe('GRADUATED');
    expect(gradRes.alumniRecord).toBeDefined();
    expect(gradRes.alumniRecord.graduationYear).toBe(2026);
    expect(gradRes.alumniRecord.honors).toContain('Best Graduating Student');

    // Verify timeline history
    const timeline = await lifecycleService.getStudentTimeline(tenantId, student.id);
    expect(timeline.length).toBeGreaterThanOrEqual(2); // ENROLLMENT and GRADUATION
    expect(timeline.some((e: any) => e.eventType === 'GRADUATION')).toBe(true);

    // Verify alumni search
    const alumniList = await lifecycleService.getAlumniRecords(tenantId, { graduationYear: 2026 });
    expect(alumniList.length).toBe(1);
    expect(alumniList[0].student.firstName).toBe('Tari');
  });
});
