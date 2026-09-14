import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { StudentsModule } from '../src/modules/students/students.module.js';
import { StudentEnrollmentService } from '../src/modules/students/services/student-enrollment.service.js';
import { StudentProgressionService } from '../src/modules/students/services/student-progression.service.js';
import { StudentTransferService } from '../src/modules/students/services/student-transfer.service.js';
import { StudentLifecycleService } from '../src/modules/students/services/student-lifecycle.service.js';
import { ConfigModule } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';

describe('TASK 25: Students — Multi-Tenant Isolation & Security Boundary', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let enrollmentService: StudentEnrollmentService;
  let progressionService: StudentProgressionService;
  let transferService: StudentTransferService;
  let lifecycleService: StudentLifecycleService;

  const tenantAlpha = 'tenant_iso_alpha';
  const tenantBeta = 'tenant_iso_beta';

  const campusAlpha = 'campus_iso_alpha';
  const campusBeta = 'campus_iso_beta';

  const ayAlpha = 'ay_iso_alpha';
  const ayBeta = 'ay_iso_beta';

  const classAlpha = 'cls_iso_alpha';
  const classBeta = 'cls_iso_beta';

  let studentAlphaId: string;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, StudentsModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    enrollmentService = moduleRef.get<StudentEnrollmentService>(StudentEnrollmentService);
    progressionService = moduleRef.get<StudentProgressionService>(StudentProgressionService);
    transferService = moduleRef.get<StudentTransferService>(StudentTransferService);
    lifecycleService = moduleRef.get<StudentLifecycleService>(StudentLifecycleService);

    // Setup Tenant Alpha
    prisma.memoryStore.tenants.set(tenantAlpha, { id: tenantAlpha, name: 'Alpha Academy' });
    prisma.memoryStore.campuses.set(campusAlpha, { id: campusAlpha, tenantId: tenantAlpha, name: 'Alpha Campus' });
    prisma.memoryStore.academicYears.set(ayAlpha, { id: ayAlpha, tenantId: tenantAlpha, name: '2026/2027', status: 'ACTIVE' });
    prisma.memoryStore.classes.set(classAlpha, { id: classAlpha, tenantId: tenantAlpha, campusId: campusAlpha, name: 'Alpha Class 1' });

    // Setup Tenant Beta
    prisma.memoryStore.tenants.set(tenantBeta, { id: tenantBeta, name: 'Beta Grammar' });
    prisma.memoryStore.campuses.set(campusBeta, { id: campusBeta, tenantId: tenantBeta, name: 'Beta Campus' });
    prisma.memoryStore.academicYears.set(ayBeta, { id: ayBeta, tenantId: tenantBeta, name: '2026/2027', status: 'ACTIVE' });
    prisma.memoryStore.classes.set(classBeta, { id: classBeta, tenantId: tenantBeta, campusId: campusBeta, name: 'Beta Class 1' });

    // Seed student in Alpha
    const enrRes = await enrollmentService.directEnroll(tenantAlpha, 'admin_alpha', {
      campusId: campusAlpha,
      classId: classAlpha,
      academicYearId: ayAlpha,
      firstName: 'Amina',
      lastName: 'Bello',
      dateOfBirth: '2012-08-01',
      gender: 'FEMALE',
      parentFirstName: 'Sani',
      parentLastName: 'Bello',
      parentEmail: 'sani.bello@example.ng',
    });
    studentAlphaId = enrRes.student.id;
  });

  it('should prevent Tenant Beta from enrolling a student into Tenant Alpha class or campus', async () => {
    await expect(
      enrollmentService.directEnroll(tenantBeta, 'admin_beta', {
        campusId: campusAlpha, // Cross-tenant campus
        classId: classBeta,
        academicYearId: ayBeta,
        firstName: 'Cross',
        lastName: 'Tenant',
        dateOfBirth: '2012-01-01',
        gender: 'MALE',
        parentFirstName: 'Cross',
        parentLastName: 'Parent',
        parentEmail: 'cross@example.ng',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should prevent Tenant Beta from promoting Tenant Alpha student', async () => {
    await expect(
      progressionService.promoteStudent(tenantBeta, studentAlphaId, 'admin_beta', {
        targetClassId: classBeta,
        targetAcademicYearId: ayBeta,
        promotionType: 'PROMOTED',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should prevent Tenant Beta from transferring Tenant Alpha student', async () => {
    await expect(
      transferService.transferClass(tenantBeta, studentAlphaId, 'admin_beta', {
        targetClassId: classBeta,
      }),
    ).rejects.toThrow(NotFoundException);

    await expect(
      transferService.transferCampus(tenantBeta, studentAlphaId, 'admin_beta', {
        targetCampusId: campusBeta,
        targetClassId: classBeta,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should prevent Tenant Beta from performing lifecycle actions on Tenant Alpha student', async () => {
    await expect(
      lifecycleService.suspendStudent(tenantBeta, studentAlphaId, 'admin_beta', {
        reason: 'Unauthorized suspension attempt',
      }),
    ).rejects.toThrow(NotFoundException);

    await expect(
      lifecycleService.graduateStudent(tenantBeta, studentAlphaId, 'admin_beta', {
        graduationDate: '2026-07-01',
        graduationYear: 2026,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should strictly isolate timeline history and alumni records across tenants', async () => {
    // Suspend and graduate in Alpha
    await lifecycleService.graduateStudent(tenantAlpha, studentAlphaId, 'admin_alpha', {
      graduationDate: '2026-07-01',
      graduationYear: 2026,
    });

    // Beta queries history for studentAlphaId -> throws NotFoundException
    await expect(
      lifecycleService.getStudentTimeline(tenantBeta, studentAlphaId),
    ).rejects.toThrow(NotFoundException);

    // Beta queries alumni -> empty
    const betaAlumni = await lifecycleService.getAlumniRecords(tenantBeta, { graduationYear: 2026 });
    expect(betaAlumni).toHaveLength(0);

    // Alpha queries alumni -> has 1 record
    const alphaAlumni = await lifecycleService.getAlumniRecords(tenantAlpha, { graduationYear: 2026 });
    expect(alphaAlumni).toHaveLength(1);
    expect(alphaAlumni[0].studentId).toBe(studentAlphaId);
  });
});
