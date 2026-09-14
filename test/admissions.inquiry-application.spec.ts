import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/database/prisma.service.js';
import { AdmissionsModule } from '../src/modules/admissions/admissions.module.js';
import { AdmissionInquiryService } from '../src/modules/admissions/services/admission-inquiry.service.js';
import { AdmissionApplicationService } from '../src/modules/admissions/services/admission-application.service.js';
import { AdmissionDocumentService } from '../src/modules/admissions/services/admission-document.service.js';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

describe('TASK 24: Admissions — Inquiry & Application Workflow', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let inquiryService: AdmissionInquiryService;
  let applicationService: AdmissionApplicationService;
  let documentService: AdmissionDocumentService;

  const tenantAlpha = 'tenant_adm_alpha';
  const campusMain = 'campus_adm_main';
  const academicYear2026 = 'ay_2026_2027';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AdmissionsModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    inquiryService = moduleRef.get<AdmissionInquiryService>(AdmissionInquiryService);
    applicationService = moduleRef.get<AdmissionApplicationService>(AdmissionApplicationService);
    documentService = moduleRef.get<AdmissionDocumentService>(AdmissionDocumentService);

    // Setup tenant data in memory store
    prisma.memoryStore.tenants.set(tenantAlpha, {
      id: tenantAlpha,
      name: 'Alpha International College',
      primaryColor: '#1e3a8a',
      currency: 'NGN',
    });
    prisma.memoryStore.campuses.set(campusMain, {
      id: campusMain,
      tenantId: tenantAlpha,
      name: 'Main Campus',
    });
  });

  it('should create an admission inquiry and list inquiries with filters', async () => {
    const inq = await inquiryService.createInquiry(tenantAlpha, {
      applicantName: 'Tunde Adeleke',
      parentName: 'Mrs. Funke Adeleke',
      parentEmail: 'funke.adeleke@example.com',
      parentPhone: '+2348011223344',
      desiredGradeLevel: 'Grade 7',
      campusId: campusMain,
      desiredAcademicYearId: academicYear2026,
      channel: 'ONLINE',
      message: 'Looking for admission into JSS1/Grade 7 for my son.',
    });

    expect(inq.id).toBeDefined();
    expect(inq.status).toBe('NEW');
    expect(inq.applicantName).toBe('Tunde Adeleke');

    const list = await inquiryService.listInquiries(tenantAlpha, { desiredGradeLevel: 'Grade 7' });
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((i: any) => i.id === inq.id)).toBe(true);

    const updatedInq = await inquiryService.updateInquiry(tenantAlpha, inq.id, {
      status: 'CONTACTED',
      followUpNotes: 'Called parent; scheduled school tour.',
    });
    expect(updatedInq.status).toBe('CONTACTED');
    expect(updatedInq.followUpNotes).toContain('scheduled school tour');
  });

  it('should submit an online admission application and generate structured application number', async () => {
    const app = await applicationService.createApplication(
      tenantAlpha,
      {
        campusId: campusMain,
        academicYearId: academicYear2026,
        gradeLevel: 'Grade 7',
        studentFirstName: 'Tunde',
        studentLastName: 'Adeleke',
        dateOfBirth: '2014-05-12',
        gender: 'MALE',
        bloodGroup: 'O+',
        previousSchool: 'Crown Heights Primary School',
        parentFirstName: 'Funke',
        parentLastName: 'Adeleke',
        parentEmail: 'funke.adeleke@example.com',
        parentPhone: '+2348011223344',
        parentRelationship: 'Mother',
        parentAddress: '15 Victoria Island, Lagos',
      },
      true, // isPublic -> SUBMITTED
    );

    expect(app.id).toBeDefined();
    expect(app.applicationNumber).toMatch(/^ADM-\d{4}-\d{4}$/);
    expect(app.status).toBe('SUBMITTED');
    expect(app.submittedAt).toBeDefined();

    const fetched = await applicationService.getApplicationById(tenantAlpha, app.id);
    expect(fetched.studentFirstName).toBe('Tunde');
    expect(fetched.documents).toEqual([]);
  });

  it('should enforce state machine transition rules and reject illegal status changes', async () => {
    const app = await applicationService.createApplication(
      tenantAlpha,
      {
        campusId: campusMain,
        academicYearId: academicYear2026,
        gradeLevel: 'Grade 10',
        studentFirstName: 'Chioma',
        studentLastName: 'Okeke',
        dateOfBirth: '2011-09-20',
        gender: 'FEMALE',
        parentFirstName: 'Emeka',
        parentLastName: 'Okeke',
        parentEmail: 'emeka.okeke@example.com',
        parentPhone: '+2348055667788',
      },
      false, // DRAFT
    );

    expect(app.status).toBe('DRAFT');

    // Illegal jump: DRAFT -> ACCEPTED must throw BadRequestException
    await expect(
      applicationService.transitionStatus(tenantAlpha, app.id, { status: 'ACCEPTED' }),
    ).rejects.toThrow(BadRequestException);

    // Valid transition: DRAFT -> SUBMITTED
    const submitted = await applicationService.transitionStatus(tenantAlpha, app.id, {
      status: 'SUBMITTED',
      internalNotes: 'Parent completed submission online.',
    });
    expect(submitted.status).toBe('SUBMITTED');

    // Valid transition: SUBMITTED -> UNDER_REVIEW
    const underReview = await applicationService.transitionStatus(tenantAlpha, app.id, {
      status: 'UNDER_REVIEW',
    });
    expect(underReview.status).toBe('UNDER_REVIEW');
  });

  it('should assign a reviewer and append internal review notes', async () => {
    const app = await applicationService.createApplication(
      tenantAlpha,
      {
        campusId: campusMain,
        academicYearId: academicYear2026,
        gradeLevel: 'Grade 8',
        studentFirstName: 'Zainab',
        studentLastName: 'Bello',
        dateOfBirth: '2013-03-15',
        gender: 'FEMALE',
        parentFirstName: 'Aliyu',
        parentLastName: 'Bello',
        parentEmail: 'aliyu.bello@example.com',
        parentPhone: '+2348099887766',
      },
      true,
    );

    const assigned = await applicationService.assignReviewer(tenantAlpha, app.id, {
      reviewerUserId: 'user_officer_musa',
      notes: 'Please review academic history and birth certificate.',
    });
    expect(assigned.reviewerUserId).toBe('user_officer_musa');
    expect(assigned.status).toBe('UNDER_REVIEW');

    const withNote = await applicationService.addInternalNote(
      tenantAlpha,
      app.id,
      'Contacted previous school for verification; records verified.',
    );
    expect(withNote.internalNotes).toContain('Contacted previous school');
  });

  it('should attach supporting documents and allow verification by authorized staff', async () => {
    const app = await applicationService.createApplication(
      tenantAlpha,
      {
        campusId: campusMain,
        academicYearId: academicYear2026,
        gradeLevel: 'Grade 7',
        studentFirstName: 'Kelechi',
        studentLastName: 'Nnamdi',
        dateOfBirth: '2014-01-10',
        gender: 'MALE',
        parentFirstName: 'Uche',
        parentLastName: 'Nnamdi',
        parentEmail: 'uche.nnamdi@example.com',
        parentPhone: '+2348022334455',
      },
      true,
    );

    const doc = await documentService.attachDocument(tenantAlpha, app.id, {
      documentType: 'BIRTH_CERTIFICATE',
      originalName: 'birth_certificate.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 154200,
    });

    expect(doc.id).toBeDefined();
    expect(doc.status).toBe('PENDING');
    expect(doc.storageKey).toContain('birth_certificate');

    const verified = await documentService.verifyDocument(
      tenantAlpha,
      doc.id,
      'user_officer_musa',
      { status: 'VERIFIED' },
    );
    expect(verified.status).toBe('VERIFIED');
    expect(verified.verifiedByUserId).toBe('user_officer_musa');
  });
});
