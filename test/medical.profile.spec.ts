import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { CloudflareR2StorageProvider } from '../src/modules/files/storage.provider.js';
import { MedicalProfileService } from '../src/modules/medical/services/medical-profile.service.js';
import { ImmunizationService } from '../src/modules/medical/services/immunization.service.js';
import {
  BloodGroup,
  Genotype,
} from '../src/modules/medical/dto/medical-profile.dto.js';
import {
  AllergyCategory,
  AllergySeverity,
} from '../src/modules/medical/dto/allergy.dto.js';
import {
  VaccineType,
  ImmunizationStatus,
} from '../src/modules/medical/dto/immunization.dto.js';

describe('Student Medical Profiles, Immunization & Allergy Tracking (Task 20 - Phase 9)', () => {
  let prisma: PrismaService;
  let storageProvider: CloudflareR2StorageProvider;
  let medicalProfileService: MedicalProfileService;
  let immunizationService: ImmunizationService;

  const tenantA = 'tenant_med_alpha';
  const tenantB = 'tenant_med_beta';
  const campusA = 'campus_med_a1';
  const classGrade5 = 'cls_grade5_med';

  const studentA1 = 'std_med_01'; // Severe allergy & Asthma
  const studentA2 = 'std_med_02'; // Sickle cell & full immunizations
  const studentA3 = 'std_med_03'; // Incomplete immunizations

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    const configServiceMock: any = {
      get: vi.fn((key: string) => {
        if (key === 'CLOUDFLARE_R2_BUCKET_NAME') return 'medical-records';
        return undefined;
      }),
    };

    storageProvider = new CloudflareR2StorageProvider(configServiceMock);
    medicalProfileService = new MedicalProfileService(prisma, storageProvider);
    immunizationService = new ImmunizationService(prisma, medicalProfileService);

    // Populate memory store
    prisma.memoryStore.tenants.set(tenantA, {
      id: tenantA,
      name: 'British International School Lagos',
      slug: 'bis-lagos',
    });
    prisma.memoryStore.tenants.set(tenantB, {
      id: tenantB,
      name: 'Greenwood Academy',
      slug: 'greenwood',
    });

    prisma.memoryStore.campuses.set(campusA, {
      id: campusA,
      tenantId: tenantA,
      name: 'Victoria Island Campus',
    });

    prisma.memoryStore.classes.set(classGrade5, {
      id: classGrade5,
      tenantId: tenantA,
      name: 'Year 5 Sapphire',
    });

    prisma.memoryStore.students.set(studentA1, {
      id: studentA1,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classGrade5,
      admissionNumber: 'BIS/2026/012',
      firstName: 'David',
      lastName: 'Adeleke',
      gender: 'MALE',
      dateOfBirth: '2015-04-12',
      status: 'ACTIVE',
    });

    prisma.memoryStore.students.set(studentA2, {
      id: studentA2,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classGrade5,
      admissionNumber: 'BIS/2026/015',
      firstName: 'Amina',
      lastName: 'Yusuf',
      gender: 'FEMALE',
      dateOfBirth: '2015-08-20',
      status: 'ACTIVE',
    });

    prisma.memoryStore.students.set(studentA3, {
      id: studentA3,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classGrade5,
      admissionNumber: 'BIS/2026/019',
      firstName: 'Chukwudi',
      lastName: 'Obi',
      gender: 'MALE',
      dateOfBirth: '2015-11-05',
      status: 'ACTIVE',
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('1. Medical Profile Creation & Vitals / BMI Calculation', () => {
    it('creates student medical profile with blood group, genotype, and computed BMI', async () => {
      const profile = await medicalProfileService.upsertMedicalProfile(tenantA, studentA1, {
        studentId: studentA1,
        bloodGroup: BloodGroup.O_POSITIVE,
        genotype: Genotype.AA,
        vitals: {
          heightCm: 140,
          weightKg: 35,
          visionStatus: 'Normal (20/20)',
          hearingStatus: 'Normal',
        },
        emergencyContact: {
          primaryContactName: 'Dr. Deji Adeleke',
          relationship: 'Father',
          primaryPhone: '+2348022334455',
          preferredHospital: 'Lagoon Hospitals Ikoyi',
          physicianName: 'Dr. K. Williams',
          physicianPhone: '+2348099887766',
        },
        hmoProvider: 'AXA Mansard Health',
        hmoPolicyNumber: 'AXA-SCH-2026-99',
      });

      expect(profile.studentId).toBe(studentA1);
      expect(profile.bloodGroup).toBe(BloodGroup.O_POSITIVE);
      expect(profile.genotype).toBe(Genotype.AA);
      // BMI = 35 / (1.4^2) = 17.857... -> 17.9
      expect(profile.vitals?.bmi).toBe(17.9);
      expect(profile.emergencyContact?.primaryContactName).toBe('Dr. Deji Adeleke');
      expect(profile.emergencyContact?.preferredHospital).toBe('Lagoon Hospitals Ikoyi');
    });
  });

  describe('2. Allergy Registry & Critical Alerts Evaluation', () => {
    it('adds life-threatening peanut allergy and evaluates HIGH-severity medical alert badge', async () => {
      const profile = await medicalProfileService.addAllergy(tenantA, studentA1, {
        allergen: 'Peanuts & Tree Nuts',
        category: AllergyCategory.FOOD,
        severity: AllergySeverity.LIFE_THREATENING,
        reactionSymptoms: 'Anaphylaxis, throat swelling, difficulty breathing',
        emergencyTreatment: 'Administer EpiPen 0.3mg immediately into outer thigh and call ambulance',
        isEpiPenRequired: true,
        medicationLocation: 'School Clinic Emergency Box & Classroom First Aid Bag',
      });

      expect(profile.allergies).toHaveLength(1);
      expect(profile.allergies[0].isEpiPenRequired).toBe(true);
      expect(profile.hasCriticalAlerts).toBe(true);

      const alert = profile.alerts.find((a: any) => a.type === 'CRITICAL_ALLERGY');
      expect(alert).toBeDefined();
      expect(alert.severity).toBe('HIGH');
      expect(alert.title).toContain('LIFE_THREATENING Allergy');
      expect(alert.actionProtocol).toContain('EpiPen');
    });

    it('records chronic asthma condition and evaluates emergency protocol', async () => {
      const profile = await medicalProfileService.upsertMedicalProfile(tenantA, studentA1, {
        studentId: studentA1,
        chronicConditions: [
          {
            conditionName: 'Moderate Persistent Asthma',
            severity: 'MODERATE',
            dailyMedications: ['Seretide Diskus (Fluticasone/Salmeterol) 1 puff daily'],
            managementProtocol: 'Ventolin inhaler 2 puffs before P.E. sports or during wheezing',
            requiresClinicEmergencyProtocol: true,
          },
        ],
      });

      expect(profile.chronicConditions).toHaveLength(1);
      const conditionAlert = profile.alerts.find((a: any) => a.type === 'CHRONIC_CONDITION');
      expect(conditionAlert).toBeDefined();
      expect(conditionAlert.actionProtocol).toContain('Ventolin inhaler');
    });
  });

  describe('3. Emergency Action Plan (EAP) & Class Alert Roster', () => {
    it('generates complete Emergency Action Plan (EAP) card for student', async () => {
      const eap = await medicalProfileService.getEmergencyActionPlan(tenantA, studentA1);

      expect(eap.emergencyPlanId).toBeDefined();
      expect(eap.student.fullName).toBe('David Adeleke');
      expect(eap.student.className).toBe('Year 5 Sapphire');
      expect(eap.student.bloodGroup).toBe(BloodGroup.O_POSITIVE);
      expect(eap.criticalAllergies).toHaveLength(1);
      expect(eap.chronicConditions).toHaveLength(1);
      expect(eap.emergencyContact.preferredHospital).toBe('Lagoon Hospitals Ikoyi');
    });

    it('retrieves class-wide medical alert roster for teachers and P.E. coordinators', async () => {
      const roster = await medicalProfileService.getClassMedicalAlertRoster(tenantA, classGrade5);

      expect(roster.classId).toBe(classGrade5);
      expect(roster.totalStudentsWithAlerts).toBeGreaterThanOrEqual(1);

      const student1Entry = roster.roster.find((r: any) => r.studentId === studentA1);
      expect(student1Entry.fullName).toBe('David Adeleke');
      expect(student1Entry.bloodGroup).toBe(BloodGroup.O_POSITIVE);
      expect(student1Entry.alerts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('4. Immunization & Vaccination Compliance', () => {
    it('records individual childhood vaccinations', async () => {
      const record1 = await immunizationService.recordImmunization(tenantA, studentA2, {
        vaccineType: VaccineType.BCG,
        vaccineName: 'BCG (Tuberculosis)',
        doseNumber: 1,
        dateAdministered: '2015-08-25',
        batchNumber: 'BCG-2015-99A',
        administeredByClinic: 'Federal Medical Centre Ebute Metta',
        status: ImmunizationStatus.ADMINISTERED,
      });

      expect(record1.id).toBeDefined();
      expect(record1.vaccineType).toBe(VaccineType.BCG);

      const history = await immunizationService.getImmunizationHistory(tenantA, studentA2);
      expect(history.totalVaccinesAdministered).toBe(1);
      expect(history.records[0].batchNumber).toBe('BCG-2015-99A');
    });

    it('batch records immunization during school clinic vaccination campaign', async () => {
      const batchRes = await immunizationService.batchRecordImmunization(tenantA, {
        studentIds: [studentA1, studentA2, studentA3],
        immunizationData: {
          vaccineType: VaccineType.YELLOW_FEVER,
          vaccineName: 'Yellow Fever Vaccine',
          doseNumber: 1,
          dateAdministered: '2026-09-10',
          batchNumber: 'YF-LAG-2026',
          administeredByClinic: 'Lagos State Ministry of Health School Outreach',
          status: ImmunizationStatus.ADMINISTERED,
        },
      });

      expect(batchRes.totalAttempted).toBe(3);
      expect(batchRes.successCount).toBe(3);
      expect(batchRes.errorsCount).toBe(0);
    });

    it('evaluates student immunization compliance against mandatory school vaccines', async () => {
      // Complete remaining vaccines for studentA2
      await immunizationService.recordImmunization(tenantA, studentA2, {
        vaccineType: VaccineType.OPV,
        vaccineName: 'OPV',
        doseNumber: 1,
        dateAdministered: '2015-09-01',
        status: ImmunizationStatus.ADMINISTERED,
      });
      await immunizationService.recordImmunization(tenantA, studentA2, {
        vaccineType: VaccineType.OPV,
        vaccineName: 'OPV',
        doseNumber: 2,
        dateAdministered: '2015-10-01',
        status: ImmunizationStatus.ADMINISTERED,
      });
      await immunizationService.recordImmunization(tenantA, studentA2, {
        vaccineType: VaccineType.OPV,
        vaccineName: 'OPV',
        doseNumber: 3,
        dateAdministered: '2015-11-01',
        status: ImmunizationStatus.ADMINISTERED,
      });
      await immunizationService.recordImmunization(tenantA, studentA2, {
        vaccineType: VaccineType.PENTAVALENT,
        vaccineName: 'Pentavalent',
        doseNumber: 1,
        dateAdministered: '2015-09-01',
        status: ImmunizationStatus.ADMINISTERED,
      });
      await immunizationService.recordImmunization(tenantA, studentA2, {
        vaccineType: VaccineType.PENTAVALENT,
        vaccineName: 'Pentavalent',
        doseNumber: 2,
        dateAdministered: '2015-10-01',
        status: ImmunizationStatus.ADMINISTERED,
      });
      await immunizationService.recordImmunization(tenantA, studentA2, {
        vaccineType: VaccineType.PENTAVALENT,
        vaccineName: 'Pentavalent',
        doseNumber: 3,
        dateAdministered: '2015-11-01',
        status: ImmunizationStatus.ADMINISTERED,
      });
      await immunizationService.recordImmunization(tenantA, studentA2, {
        vaccineType: VaccineType.MEASLES,
        vaccineName: 'Measles Vaccine',
        doseNumber: 1,
        dateAdministered: '2016-05-20',
        status: ImmunizationStatus.ADMINISTERED,
      });
      await immunizationService.recordImmunization(tenantA, studentA2, {
        vaccineType: VaccineType.TETANUS_TOXOID,
        vaccineName: 'Tetanus Toxoid',
        doseNumber: 1,
        dateAdministered: '2024-02-15',
        status: ImmunizationStatus.ADMINISTERED,
      });

      const compliance = await immunizationService.checkImmunizationCompliance(tenantA, studentA2);
      expect(compliance.isFullyCompliant).toBe(true);
      expect(compliance.compliancePercentage).toBe(100);
      expect(compliance.nonCompliantCount).toBe(0);
    });

    it('identifies non-compliant student with missing required vaccines', async () => {
      // studentA3 only has Yellow fever from the batch
      const compliance = await immunizationService.checkImmunizationCompliance(tenantA, studentA3);
      expect(compliance.isFullyCompliant).toBe(false);
      expect(compliance.nonCompliantCount).toBeGreaterThan(0);
      expect(compliance.compliancePercentage).toBeLessThan(100);

      const bcgEval = compliance.evaluation.find((e) => e.vaccineType === VaccineType.BCG);
      expect(bcgEval?.isCompliant).toBe(false);
    });
  });

  describe('5. Multi-Tenant Security & Medical Record Isolation', () => {
    it('ensures Tenant B cannot view or modify Tenant A medical records', async () => {
      await expect(
        medicalProfileService.getMedicalProfile(tenantB, studentA1),
      ).rejects.toThrow();

      await expect(
        immunizationService.getImmunizationHistory(tenantB, studentA1),
      ).rejects.toThrow();
    });
  });
});
