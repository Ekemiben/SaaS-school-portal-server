import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/database/prisma.service.js';
import { AdmissionsModule } from '../src/modules/admissions/admissions.module.js';
import { AdmissionInquiryService } from '../src/modules/admissions/services/admission-inquiry.service.js';
import { AdmissionApplicationService } from '../src/modules/admissions/services/admission-application.service.js';
import { AdmissionDocumentService } from '../src/modules/admissions/services/admission-document.service.js';
import { AdmissionOfferService } from '../src/modules/admissions/services/admission-offer.service.js';
import { NotFoundException } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

describe('TASK 24: Admissions — Multi-Tenant & Multi-Campus Security Isolation', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let inquiryService: AdmissionInquiryService;
  let applicationService: AdmissionApplicationService;
  let documentService: AdmissionDocumentService;
  let offerService: AdmissionOfferService;

  const tenantAlpha = 'tenant_iso_alpha';
  const tenantBeta = 'tenant_iso_beta';
  const campusAlphaMain = 'campus_iso_alpha_main';
  const campusBetaMain = 'campus_iso_beta_main';
  const campusAlphaNorth = 'campus_iso_alpha_north';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AdmissionsModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    inquiryService = moduleRef.get<AdmissionInquiryService>(AdmissionInquiryService);
    applicationService = moduleRef.get<AdmissionApplicationService>(AdmissionApplicationService);
    documentService = moduleRef.get<AdmissionDocumentService>(AdmissionDocumentService);
    offerService = moduleRef.get<AdmissionOfferService>(AdmissionOfferService);

    prisma.memoryStore.tenants.set(tenantAlpha, { id: tenantAlpha, name: 'Alpha Academy' });
    prisma.memoryStore.tenants.set(tenantBeta, { id: tenantBeta, name: 'Beta High School' });

    prisma.memoryStore.campuses.set(campusAlphaMain, {
      id: campusAlphaMain,
      tenantId: tenantAlpha,
      name: 'Alpha Main',
    });
    prisma.memoryStore.campuses.set(campusAlphaNorth, {
      id: campusAlphaNorth,
      tenantId: tenantAlpha,
      name: 'Alpha North',
    });
    prisma.memoryStore.campuses.set(campusBetaMain, {
      id: campusBetaMain,
      tenantId: tenantBeta,
      name: 'Beta Main',
    });
  });

  it('should guarantee cross-tenant inquiry isolation', async () => {
    const inqAlpha = await inquiryService.createInquiry(tenantAlpha, {
      applicantName: 'Student Alpha',
      parentName: 'Parent Alpha',
      parentPhone: '+2348011111111',
    });

    const inqBeta = await inquiryService.createInquiry(tenantBeta, {
      applicantName: 'Student Beta',
      parentName: 'Parent Beta',
      parentPhone: '+2348022222222',
    });

    // Tenant Alpha cannot read Tenant Beta inquiry
    await expect(inquiryService.getInquiryById(tenantAlpha, inqBeta.id)).rejects.toThrow(
      NotFoundException,
    );

    // Tenant Beta listing should NOT contain Tenant Alpha inquiry
    const listBeta = await inquiryService.listInquiries(tenantBeta);
    expect(listBeta.some((i: any) => i.id === inqAlpha.id)).toBe(false);
    expect(listBeta.some((i: any) => i.id === inqBeta.id)).toBe(true);
  });

  it('should prohibit Tenant B from reading, updating, or accessing Tenant A applications and documents', async () => {
    const appAlpha = await applicationService.createApplication(
      tenantAlpha,
      {
        campusId: campusAlphaMain,
        academicYearId: 'ay_2026',
        gradeLevel: 'Grade 7',
        studentFirstName: 'AlphaKid',
        studentLastName: 'One',
        dateOfBirth: '2014-01-01',
        gender: 'MALE',
        parentFirstName: 'AlphaParent',
        parentLastName: 'One',
        parentEmail: 'alpha.parent@test.com',
        parentPhone: '+2348011111111',
      },
      true,
    );

    const docAlpha = await documentService.attachDocument(tenantAlpha, appAlpha.id, {
      documentType: 'PASSPORT_PHOTO',
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 45000,
    });

    // Tenant Beta attempts to get Tenant Alpha application -> 404 NotFoundException
    await expect(applicationService.getApplicationById(tenantBeta, appAlpha.id)).rejects.toThrow(
      NotFoundException,
    );

    // Tenant Beta attempts to update Tenant Alpha application -> 404 NotFoundException
    await expect(
      applicationService.updateApplication(tenantBeta, appAlpha.id, { studentFirstName: 'Hacked' }),
    ).rejects.toThrow(NotFoundException);

    // Tenant Beta attempts to access Tenant Alpha documents -> 404 NotFoundException
    await expect(documentService.getDocumentById(tenantBeta, docAlpha.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(documentService.listDocuments(tenantBeta, appAlpha.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should prohibit cross-tenant offer manipulation or response', async () => {
    const appAlpha = await applicationService.createApplication(
      tenantAlpha,
      {
        campusId: campusAlphaMain,
        academicYearId: 'ay_2026',
        gradeLevel: 'Grade 7',
        studentFirstName: 'Sade',
        studentLastName: 'Adu',
        dateOfBirth: '2014-02-02',
        gender: 'FEMALE',
        parentFirstName: 'Parent',
        parentLastName: 'Adu',
        parentEmail: 'adu@test.com',
        parentPhone: '+2348033333333',
      },
      true,
    );

    const offerAlpha = await offerService.generateOffer(tenantAlpha, appAlpha.id, {
      campusId: campusAlphaMain,
      academicYearId: 'ay_2026',
      offeredGradeLevel: 'Grade 7',
      acceptanceDeadline: new Date(Date.now() + 86400000).toISOString(),
      acceptanceFeeAmount: 0,
    });

    // Tenant Beta attempts to read Tenant Alpha offer -> 404
    await expect(offerService.getOfferById(tenantBeta, offerAlpha.id)).rejects.toThrow(
      NotFoundException,
    );

    // Tenant Beta attempts to respond to Tenant Alpha offer -> 404
    await expect(
      offerService.respondToOffer(tenantBeta, offerAlpha.id, { response: 'ACCEPTED' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should enforce campus scoping within the same tenant', async () => {
    const appMain = await applicationService.createApplication(
      tenantAlpha,
      {
        campusId: campusAlphaMain,
        academicYearId: 'ay_2026',
        gradeLevel: 'Grade 7',
        studentFirstName: 'MainKid',
        studentLastName: 'Campus',
        dateOfBirth: '2014-03-03',
        gender: 'MALE',
        parentFirstName: 'MainParent',
        parentLastName: 'Campus',
        parentEmail: 'main@test.com',
        parentPhone: '+2348044444444',
      },
      true,
    );

    const appNorth = await applicationService.createApplication(
      tenantAlpha,
      {
        campusId: campusAlphaNorth,
        academicYearId: 'ay_2026',
        gradeLevel: 'Grade 7',
        studentFirstName: 'NorthKid',
        studentLastName: 'Campus',
        dateOfBirth: '2014-04-04',
        gender: 'FEMALE',
        parentFirstName: 'NorthParent',
        parentLastName: 'Campus',
        parentEmail: 'north@test.com',
        parentPhone: '+2348055555555',
      },
      true,
    );

    // List filtered by campusAlphaNorth must only contain NorthKid
    const northList = await applicationService.listApplications(tenantAlpha, {
      campusId: campusAlphaNorth,
    });
    expect(northList.some((a: any) => a.id === appNorth.id)).toBe(true);
    expect(northList.some((a: any) => a.id === appMain.id)).toBe(false);
  });
});
