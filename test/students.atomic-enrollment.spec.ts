import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AdmissionsModule } from '../src/modules/admissions/admissions.module.js';
import { StudentsModule } from '../src/modules/students/students.module.js';
import { AdmissionApplicationService } from '../src/modules/admissions/services/admission-application.service.js';
import { AdmissionOfferService } from '../src/modules/admissions/services/admission-offer.service.js';
import { AdmissionDocumentService } from '../src/modules/admissions/services/admission-document.service.js';
import { StudentEnrollmentService } from '../src/modules/students/services/student-enrollment.service.js';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('TASK 25: Students — Atomic Enrollment from Offer & Direct Enrollment', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let applicationService: AdmissionApplicationService;
  let offerService: AdmissionOfferService;
  let documentService: AdmissionDocumentService;
  let enrollmentService: StudentEnrollmentService;

  const tenantId = 'tenant_enr_test';
  const campusId = 'campus_enr_test';
  const academicYearId = 'ay_2026_enr';
  const classId = 'cls_grade7_a';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AdmissionsModule, StudentsModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    applicationService = moduleRef.get<AdmissionApplicationService>(AdmissionApplicationService);
    offerService = moduleRef.get<AdmissionOfferService>(AdmissionOfferService);
    documentService = moduleRef.get<AdmissionDocumentService>(AdmissionDocumentService);
    enrollmentService = moduleRef.get<StudentEnrollmentService>(StudentEnrollmentService);

    // Setup base tenant, campus, class, academic year
    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Highland International Academy',
      code: 'HIA',
    });
    prisma.memoryStore.campuses.set(campusId, {
      id: campusId,
      tenantId,
      name: 'Central Campus',
    });
    prisma.memoryStore.academicYears.set(academicYearId, {
      id: academicYearId,
      tenantId,
      name: '2026/2027 Academic Year',
      status: 'ACTIVE',
    });
    prisma.memoryStore.classes.set(classId, {
      id: classId,
      tenantId,
      campusId,
      name: 'Grade 7 Alpha',
      capacity: 35,
    });
  });

  async function createAcceptedOffer() {
    const app = await applicationService.createApplication(
      tenantId,
      {
        campusId,
        academicYearId,
        gradeLevel: 'Grade 7',
        studentFirstName: 'Chioma',
        studentLastName: 'Eze',
        dateOfBirth: '2014-03-25',
        gender: 'FEMALE',
        parentFirstName: 'Emeka',
        parentLastName: 'Eze',
        parentEmail: 'emeka.eze@example.ng',
        parentPhone: '+2348011223344',
      },
      true,
    );

    // Add document
    await documentService.attachDocument(tenantId, app.id, {
      documentType: 'BIRTH_CERTIFICATE',
      originalName: 'birth_cert_eze.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 102400,
    });

    await applicationService.transitionStatus(tenantId, app.id, { status: 'UNDER_REVIEW' });
    const offer = await offerService.generateOffer(tenantId, app.id, {
      campusId,
      academicYearId,
      offeredGradeLevel: 'Grade 7',
      acceptanceDeadline: new Date(Date.now() + 86400000).toISOString(),
      acceptanceFeeAmount: 0,
    });

    // Accept offer
    await offerService.respondToOffer(tenantId, offer.id, {
      response: 'ACCEPTED',
      parentEmail: 'emeka.eze@example.ng',
    });

    return { app, offer };
  }

  it('should atomically enroll student from accepted admission offer', async () => {
    const { app, offer } = await createAcceptedOffer();

    const result = await enrollmentService.enrollFromOffer(tenantId, 'admin_user_1', {
      offerId: offer.id,
      classId,
      academicYearId,
      rollNumber: '001',
    });

    expect(result.student).toBeDefined();
    expect(result.student.firstName).toBe('Chioma');
    expect(result.student.lastName).toBe('Eze');
    expect(result.student.admissionNumber).toMatch(/^SCH\/\d{4}\/\d{4}$/);
    expect(result.student.status).toBe('ACTIVE');

    // Verify enrollment record
    expect(result.enrollment).toBeDefined();
    expect(result.enrollment.classId).toBe(classId);
    expect(result.enrollment.academicYearId).toBe(academicYearId);
    expect(result.enrollment.status).toBe('ACTIVE');

    // Verify parent linkage
    expect(result.parent).toBeDefined();
    expect(result.parent.email).toBe('emeka.eze@example.ng');
    expect(result.studentParent).toBeDefined();
    expect(result.studentParent.isEmergencyContact).toBe(true);

    // Verify lifecycle timeline event
    expect(result.lifecycleEvent).toBeDefined();
    expect(result.lifecycleEvent.eventType).toBe('ENROLLMENT');
    expect(result.lifecycleEvent.toClassId).toBe(classId);

    // Verify offer and application updated states
    const updatedOffer = prisma.memoryStore.admissionOffers.get(offer.id);
    expect(updatedOffer.status).toBe('ENROLLED');

    const updatedApp = prisma.memoryStore.admissionApplications.get(app.id);
    expect(updatedApp.status).toBe('ACCEPTED');
  });

  it('should reject enrollment if admission offer is not in ACCEPTED status', async () => {
    const app = await applicationService.createApplication(
      tenantId,
      {
        campusId,
        academicYearId,
        gradeLevel: 'Grade 7',
        studentFirstName: 'Kelechi',
        studentLastName: 'Okafor',
        dateOfBirth: '2014-08-10',
        gender: 'MALE',
        parentFirstName: 'Amaka',
        parentLastName: 'Okafor',
        parentEmail: 'amaka.okafor@example.ng',
        parentPhone: '+2348022334455',
      },
      true,
    );

    await applicationService.transitionStatus(tenantId, app.id, { status: 'UNDER_REVIEW' });
    const offer = await offerService.generateOffer(tenantId, app.id, {
      campusId,
      academicYearId,
      offeredGradeLevel: 'Grade 7',
      acceptanceDeadline: new Date(Date.now() + 86400000).toISOString(),
      acceptanceFeeAmount: 0,
    });

    // Offer is still EXTENDED, not ACCEPTED
    await expect(
      enrollmentService.enrollFromOffer(tenantId, 'admin_user_1', {
        offerId: offer.id,
        classId,
        academicYearId,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should perform direct manual enrollment without prior admission application', async () => {
    const result = await enrollmentService.directEnroll(tenantId, 'admin_user_2', {
      campusId,
      classId,
      academicYearId,
      firstName: 'Tunde',
      lastName: 'Bakare',
      dateOfBirth: '2013-11-04',
      gender: 'MALE',
      parentFirstName: 'Babatunde',
      parentLastName: 'Bakare',
      parentEmail: 'babatunde.bakare@example.ng',
      parentPhone: '+2348099887766',
      relationship: 'FATHER',
    });

    expect(result.student).toBeDefined();
    expect(result.student.firstName).toBe('Tunde');
    expect(result.student.admissionNumber).toMatch(/^SCH\/\d{4}\/\d{4}$/);
    expect(result.enrollment.classId).toBe(classId);
    expect(result.lifecycleEvent.eventType).toBe('ENROLLMENT');
  });

  it('should reject enrollment when custom admission number is already taken', async () => {
    await enrollmentService.directEnroll(tenantId, 'admin_user_1', {
      campusId,
      classId,
      academicYearId,
      firstName: 'Fatima',
      lastName: 'Danjuma',
      dateOfBirth: '2014-01-15',
      gender: 'FEMALE',
      parentFirstName: 'Aliyu',
      parentLastName: 'Danjuma',
      parentEmail: 'aliyu.danjuma@example.ng',
      parentPhone: '+2348055667788',
      customAdmissionNumber: 'SCH/2026/9999',
    });

    await expect(
      enrollmentService.directEnroll(tenantId, 'admin_user_1', {
        campusId,
        classId,
        academicYearId,
        firstName: 'Zainab',
        lastName: 'Danjuma',
        dateOfBirth: '2015-05-12',
        gender: 'FEMALE',
        parentFirstName: 'Aliyu',
        parentLastName: 'Danjuma',
        parentEmail: 'aliyu.danjuma@example.ng',
        parentPhone: '+2348055667788',
        customAdmissionNumber: 'SCH/2026/9999',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
