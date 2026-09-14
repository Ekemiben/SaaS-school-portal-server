import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { CloudflareR2StorageProvider } from '../src/modules/files/storage.provider.js';
import { MedicalProfileService } from '../src/modules/medical/services/medical-profile.service.js';
import { ImmunizationService } from '../src/modules/medical/services/immunization.service.js';
import { MedicalPolicyService } from '../src/modules/medical/services/medical-policy.service.js';
import { FitnessCertificateService } from '../src/modules/medical/services/fitness-certificate.service.js';
import { HealthScreeningService } from '../src/modules/medical/services/health-screening.service.js';
import { HealthComplianceService } from '../src/modules/medical/services/health-compliance.service.js';
import {
  ActivityContext,
  ContextualComplianceStatus,
  PolicyRequirementLevel,
} from '../src/modules/medical/dto/health-policy.dto.js';
import {
  CertificateType,
  FitnessStatus,
} from '../src/modules/medical/dto/fitness-certificate.dto.js';
import {
  ScreeningType,
  ScreeningOutcome,
} from '../src/modules/medical/dto/health-screening.dto.js';

describe('TASK 22 — Medical Fitness Certificates & Contextual Compliance', () => {
  let prisma: PrismaService;
  let storageProvider: CloudflareR2StorageProvider;
  let medicalProfileService: MedicalProfileService;
  let immunizationService: ImmunizationService;
  let policyService: MedicalPolicyService;
  let certService: FitnessCertificateService;
  let screeningService: HealthScreeningService;
  let complianceService: HealthComplianceService;

  const tenantAlpha = 'tenant_alpha_sports_req';
  const tenantBeta = 'tenant_beta_optional';
  const campusA = 'campus_alpha_main';
  const student1 = 'a0000000-0000-0000-0000-000000000001';
  const student2 = 'a0000000-0000-0000-0000-000000000002';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    const configServiceMock: any = {
      get: vi.fn((key: string) => {
        if (key === 'CLOUDFLARE_R2_BUCKET_NAME') return 'medical-records';
        return 'mock-val';
      }),
    };

    storageProvider = new CloudflareR2StorageProvider(configServiceMock);
    medicalProfileService = new MedicalProfileService(prisma, storageProvider);
    immunizationService = new ImmunizationService(prisma, medicalProfileService);
    policyService = new MedicalPolicyService(prisma);
    certService = new FitnessCertificateService(prisma, medicalProfileService);
    screeningService = new HealthScreeningService(prisma, medicalProfileService);
    complianceService = new HealthComplianceService(
      policyService,
      certService,
      screeningService,
      immunizationService,
    );

    // Setup Tenants
    prisma.memoryStore.tenants.set(tenantAlpha, { id: tenantAlpha, name: 'Alpha Grammar School' });
    prisma.memoryStore.tenants.set(tenantBeta, { id: tenantBeta, name: 'Beta International' });

    prisma.memoryStore.campuses.set(campusA, {
      id: campusA,
      tenantId: tenantAlpha,
      name: 'Main Campus',
    });

    prisma.memoryStore.students.set(student1, {
      id: student1,
      tenantId: tenantAlpha,
      campusId: campusA,
      admissionNumber: 'SCH/2026/001',
      firstName: 'Tunde',
      lastName: 'Balogun',
      gender: 'MALE',
      dateOfBirth: new Date('2014-05-12'),
      status: 'ACTIVE',
    });

    prisma.memoryStore.students.set(student2, {
      id: student2,
      tenantId: tenantAlpha,
      campusId: campusA,
      admissionNumber: 'SCH/2026/002',
      firstName: 'Zainab',
      lastName: 'Ahmed',
      gender: 'FEMALE',
      dateOfBirth: new Date('2013-11-20'),
      status: 'ACTIVE',
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('1. General platform and academic access must ALWAYS be ALLOWED even with zero medical records', async () => {
    const academicEligibility = await complianceService.checkActivityEligibility(tenantAlpha, {
      studentId: student1,
      activityContext: ActivityContext.GENERAL_ACADEMICS,
    });

    expect(academicEligibility.isEligible).toBe(true);
    expect(academicEligibility.status).toBe(ContextualComplianceStatus.CLEARED);
    expect(academicEligibility.generalPlatformAccess).toBe('ALLOWED');

    const studentSummary = await complianceService.getStudentComplianceSummary(tenantAlpha, student1);
    expect(studentSummary.generalPlatformAccess).toBe('ALLOWED');
    expect(studentSummary.activityClearance.academics.isEligible).toBe(true);
  });

  it('2. Tenant health policies are configurable per school (REQUIRED vs OPTIONAL vs DISABLED)', async () => {
    // School Alpha requires sports clearance
    await policyService.updatePolicy(tenantAlpha, {
      sportsClearance: PolicyRequirementLevel.REQUIRED,
      hostelClearance: PolicyRequirementLevel.OPTIONAL,
    });

    // School Beta has all optional
    await policyService.updatePolicy(tenantBeta, {
      sportsClearance: PolicyRequirementLevel.OPTIONAL,
      hostelClearance: PolicyRequirementLevel.NOT_APPLICABLE,
    });

    const policyA = await policyService.getPolicy(tenantAlpha);
    const policyB = await policyService.getPolicy(tenantBeta);

    expect(policyA.sportsClearance).toBe(PolicyRequirementLevel.REQUIRED);
    expect(policyB.sportsClearance).toBe(PolicyRequirementLevel.OPTIONAL);
    expect(policyB.hostelClearance).toBe(PolicyRequirementLevel.NOT_APPLICABLE);
  });

  it('3. When sports is REQUIRED and student has no certificate, sports is PENDING_REVIEW while general access remains ALLOWED', async () => {
    await policyService.updatePolicy(tenantAlpha, {
      sportsClearance: PolicyRequirementLevel.REQUIRED,
    });

    const eligibility = await complianceService.checkActivityEligibility(tenantAlpha, {
      studentId: student2,
      activityContext: ActivityContext.SPORTS_ATHLETICS,
    });

    expect(eligibility.isEligible).toBe(false);
    expect(eligibility.status).toBe(ContextualComplianceStatus.PENDING_REVIEW);
    expect(eligibility.generalPlatformAccess).toBe('ALLOWED');
  });

  it('4. Issue verifiable medical fitness certificate and verify public token', async () => {
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const cert = await certService.issueCertificate(tenantAlpha, {
      studentId: student1,
      certificateType: CertificateType.SPORTS_ATHLETICS,
      fitnessStatus: FitnessStatus.FIT_UNCONDITIONAL,
      examiningPhysician: 'Dr. John Doe, MD',
      medicalLicenseNumber: 'MDCN/2026/8941',
      clinicOrHospitalName: 'St. Nicholas Hospital',
      examinationDate: '2026-09-01',
      validUntil: oneYearLater.toISOString(),
      clinicalNotes: 'Fit for all athletic activities.',
    });

    expect(cert.id).toBeDefined();
    expect(cert.verificationCode).toMatch(/^MCERT-/);

    const verification = await certService.verifyCertificatePublic(tenantAlpha, cert.verificationCode);
    expect(verification.isValid).toBe(true);
    expect(verification.fitnessStatus).toBe(FitnessStatus.FIT_UNCONDITIONAL);
    expect(verification.clinicOrHospitalName).toBe('St. Nicholas Hospital');
  });

  it('5. FIT_WITH_RESTRICTIONS restricts only specific activities without blocking general platform access', async () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    await certService.issueCertificate(tenantAlpha, {
      studentId: student1,
      certificateType: CertificateType.SPORTS_ATHLETICS,
      fitnessStatus: FitnessStatus.FIT_WITH_RESTRICTIONS,
      examiningPhysician: 'Dr. Jane Smith',
      medicalLicenseNumber: 'MDCN/2025/1122',
      clinicOrHospitalName: 'Lagos University Teaching Hospital',
      examinationDate: '2026-09-10',
      validUntil: nextYear.toISOString(),
      activityRestrictions: ['No competitive contact sports', 'Asthma inhaler required at pitch'],
    });

    const sportsEligibility = await complianceService.checkActivityEligibility(tenantAlpha, {
      studentId: student1,
      activityContext: ActivityContext.SPORTS_ATHLETICS,
    });

    expect(sportsEligibility.isEligible).toBe(true);
    expect(sportsEligibility.status).toBe(ContextualComplianceStatus.CLEARED_WITH_RESTRICTIONS);
    expect(sportsEligibility.restrictions).toContain('No competitive contact sports');
    expect(sportsEligibility.generalPlatformAccess).toBe('ALLOWED');
  });

  it('6. PERMANENTLY_UNFIT_FOR_ACTIVITY prevents activity participation but NEVER suspends student account', async () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    await certService.issueCertificate(tenantAlpha, {
      studentId: student2,
      certificateType: CertificateType.SPORTS_ATHLETICS,
      fitnessStatus: FitnessStatus.PERMANENTLY_UNFIT_FOR_ACTIVITY,
      examiningPhysician: 'Dr. Cardiologist',
      medicalLicenseNumber: 'MDCN/2020/9999',
      clinicOrHospitalName: 'Redington Hospital',
      examinationDate: '2026-09-12',
      validUntil: nextYear.toISOString(),
      activityRestrictions: ['Strenuous cardiovascular activity contraindicated'],
    });

    const sportsEligibility = await complianceService.checkActivityEligibility(tenantAlpha, {
      studentId: student2,
      activityContext: ActivityContext.SPORTS_ATHLETICS,
    });

    expect(sportsEligibility.isEligible).toBe(false);
    expect(sportsEligibility.status).toBe(ContextualComplianceStatus.ACTIVITY_RESTRICTED);
    expect(sportsEligibility.generalPlatformAccess).toBe('ALLOWED');

    const academicEligibility = await complianceService.checkActivityEligibility(tenantAlpha, {
      studentId: student2,
      activityContext: ActivityContext.GENERAL_ACADEMICS,
    });
    expect(academicEligibility.isEligible).toBe(true);
    expect(academicEligibility.generalPlatformAccess).toBe('ALLOWED');
  });

  it('7. Health screening records findings and follow-ups without restricting student accounts', async () => {
    const screening = await screeningService.recordScreening(tenantAlpha, {
      studentId: student1,
      screeningType: ScreeningType.VISION_ACUITY,
      outcome: ScreeningOutcome.FOLLOW_UP_REQUIRED,
      screenerName: 'Nurse Florence',
      screenerDesignation: 'School Head Nurse',
      screeningDate: '2026-09-13',
      findings: 'OD 20/20, OS 20/50. Suspected mild myopia in left eye.',
      referralRecommended: true,
      referralDestination: 'Optometrist Clinic',
      followUpDueDate: '2026-10-15',
    });

    expect(screening.id).toBeDefined();
    expect(screening.referralRecommended).toBe(true);

    const followUps = await screeningService.getPendingFollowUps(tenantAlpha);
    expect(followUps.length).toBeGreaterThanOrEqual(1);

    const summary = await complianceService.getStudentComplianceSummary(tenantAlpha, student1);
    expect(summary.generalPlatformAccess).toBe('ALLOWED');
  });

  it('8. Batch screening campaign logs screening for multiple students seamlessly', async () => {
    const batchResult = await screeningService.batchRecordScreening(tenantAlpha, {
      studentIds: [student1, student2],
      screeningTemplate: {
        studentId: student1,
        screeningType: ScreeningType.DENTAL_ORAL_HEALTH,
        outcome: ScreeningOutcome.NORMAL_CLEAR,
        screenerName: 'Dr. Dental Specialist',
        screenerDesignation: 'Visiting Dentist',
        screeningDate: '2026-09-13',
        findings: 'No active dental caries. Good oral hygiene.',
      },
    });

    expect(batchResult.successCount).toBe(2);
    expect(batchResult.records.length).toBe(2);
  });

  it('9. Multi-tenant isolation: Tenant B cannot access Tenant A certificates or screenings', async () => {
    const certsAlpha = await certService.getCertificates(tenantAlpha);
    const certsBeta = await certService.getCertificates(tenantBeta);

    expect(certsAlpha.length).toBeGreaterThan(0);
    expect(certsBeta.length).toBe(0);

    const auditBeta = await complianceService.getInstitutionalComplianceAudit(tenantBeta);
    expect(auditBeta.totalCertificatesIssued).toBe(0);
    expect(auditBeta.generalPlatformAccessRule).toBe('Unrestricted for all users regardless of medical status');
  });
});
