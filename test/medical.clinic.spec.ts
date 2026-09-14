import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { BullmqService } from '../src/jobs/bullmq.service.js';
import { ClinicService } from '../src/modules/medical/services/clinic.service.js';
import {
  PatientType,
  VisitType,
  VisitOutcome,
} from '../src/modules/medical/dto/clinic-visit.dto.js';
import { MedicationRoute } from '../src/modules/medical/dto/dispensation.dto.js';
import {
  IncidentSeverity,
  IncidentLocation,
} from '../src/modules/medical/dto/incident.dto.js';

describe('Clinic Visits, Daily Dispensation & Incident Logging (Task 21 - Phase 9)', () => {
  let prisma: PrismaService;
  let bullmqService: BullmqService;
  let clinicService: ClinicService;

  const tenantA = 'tenant_clinic_alpha';
  const tenantB = 'tenant_clinic_beta';
  const campusA = 'campus_clinic_a1';
  const student1 = 'std_cln_01';
  const student2 = 'std_cln_02';
  const parent1 = 'prt_cln_01';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    const configServiceMock: any = { get: vi.fn() };
    bullmqService = new BullmqService(configServiceMock);
    vi.spyOn(bullmqService, 'dispatch').mockResolvedValue('mock-job-id' as any);

    clinicService = new ClinicService(prisma, bullmqService);

    // Setup Tenant & Campus
    prisma.memoryStore.tenants.set(tenantA, { id: tenantA, name: 'Grange School Ikeja' });
    prisma.memoryStore.tenants.set(tenantB, { id: tenantB, name: 'Meadow Hall School' });

    prisma.memoryStore.campuses.set(campusA, {
      id: campusA,
      tenantId: tenantA,
      name: 'Main Campus',
    });

    // Parent
    prisma.memoryStore.parents.set(parent1, {
      id: parent1,
      tenantId: tenantA,
      firstName: 'Folake',
      lastName: 'Sanusi',
      email: 'folake.sanusi@example.com',
      phone: '+2348055667788',
    });

    // Students
    prisma.memoryStore.students.set(student1, {
      id: student1,
      tenantId: tenantA,
      campusId: campusA,
      firstName: 'Tunde',
      lastName: 'Sanusi',
      admissionNumber: 'GRG/2026/088',
    });

    prisma.memoryStore.students.set(student2, {
      id: student2,
      tenantId: tenantA,
      campusId: campusA,
      firstName: 'Zainab',
      lastName: 'Aliyu',
      admissionNumber: 'GRG/2026/092',
    });

    const memory = prisma.memoryStore as any;
    memory.studentParents = new Map();
    memory.studentParents.set('sp_1', { studentId: student1, parentId: parent1 });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('1. Clinic Visits & Sickbay Admission/Discharge', () => {
    let createdVisitId: string;

    it('records student clinic visit with vitals, complaint, and triggers parent alert', async () => {
      const visit = await clinicService.recordClinicVisit(tenantA, {
        patientType: PatientType.STUDENT,
        patientId: student1,
        visitType: VisitType.ILLNESS_COMPLAINT,
        chiefComplaint: 'High fever and headache during morning class',
        symptoms: ['Fever', 'Headache', 'Chills'],
        vitals: {
          temperatureCelsius: 38.8,
          pulseBpm: 92,
          systolicBp: 110,
          diastolicBp: 70,
          spo2Percentage: 98,
        },
        diagnosis: 'Suspected Malaria / Pyrexia of Unknown Origin',
        treatmentGiven: 'Cold compress, Paracetamol 500mg administered, rested in sickbay',
        outcome: VisitOutcome.RESTING_IN_SICKBAY,
        sickbayBedNumber: 'Bed 03',
        attendedByStaffName: 'Nurse B. Okon',
        notifyParents: true,
      });

      expect(visit.id).toBeDefined();
      expect(visit.patientName).toBe('Tunde Sanusi');
      expect(visit.vitals?.temperatureCelsius).toBe(38.8);
      expect(visit.outcome).toBe(VisitOutcome.RESTING_IN_SICKBAY);
      expect(visit.dischargedAt).toBeNull();
      createdVisitId = visit.id;

      // BullMQ parent email notification queued
      expect(bullmqService.dispatch).toHaveBeenCalled();
    });

    it('discharges patient from sickbay with clinical discharge notes', async () => {
      const discharged = await clinicService.dischargePatient(tenantA, createdVisitId, {
        outcome: VisitOutcome.SENT_HOME_TO_PARENTS,
        dischargeNotes: 'Parent arrived to pick student up for comprehensive medical lab tests',
      });

      expect(discharged.outcome).toBe(VisitOutcome.SENT_HOME_TO_PARENTS);
      expect(discharged.dischargedAt).toBeDefined();
      expect(discharged.dischargeNotes).toContain('Parent arrived');
    });

    it('lists and filters clinic visits for the tenant', async () => {
      const list = await clinicService.listClinicVisits(tenantA, {
        patientType: PatientType.STUDENT,
      });

      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0].id).toBe(createdVisitId);
    });
  });

  describe('2. Daily Medication Administration & Dispensation', () => {
    it('records daily medication dispensation with parental consent verification', async () => {
      const disp = await clinicService.recordMedicationDispensation(tenantA, {
        studentId: student1,
        medicationName: 'Paracetamol 500mg Tablets',
        dosage: '1 tablet (500mg)',
        quantityDispensed: 1,
        route: MedicationRoute.ORAL,
        administeredAt: new Date().toISOString(),
        administeredByStaffName: 'Nurse B. Okon',
        parentConsentVerified: true,
        batchNumber: 'PARA-2026-X1',
        notes: 'Administered post cold compress for fever relief',
      });

      expect(disp.id).toBeDefined();
      expect(disp.medicationName).toBe('Paracetamol 500mg Tablets');
      expect(disp.parentConsentVerified).toBe(true);
      expect(disp.studentName).toBe('Tunde Sanusi');
    });

    it('retrieves medication dispensation log for student', async () => {
      const studentDispensations = await clinicService.listMedicationDispensations(tenantA, student1);
      expect(studentDispensations).toHaveLength(1);
      expect(studentDispensations[0].batchNumber).toBe('PARA-2026-X1');
    });
  });

  describe('3. First Aid & Health Incident Logging', () => {
    it('logs major sports injury incident and dispatches urgent parent alert', async () => {
      const incident = await clinicService.logHealthIncident(tenantA, {
        studentId: student1,
        incidentType: 'Suspected Right Ankle Fracture',
        severity: IncidentSeverity.MAJOR,
        location: IncidentLocation.PLAYGROUND_SPORTS_FIELD,
        occurredAt: new Date().toISOString(),
        description: 'Student twisted ankle awkwardly while jumping during inter-house football practice',
        witnessStaffNames: ['Coach Emeka (P.E. Teacher)', 'Mr. Adeleke'],
        immediateFirstAidGiven: 'Ankle immobilized with crepe bandage & splint, ice pack applied immediately',
        isHospitalReferralRequired: true,
        hospitalName: 'St. Nicholas Hospital Lagos',
        ambulanceCalled: true,
        escortStaffName: 'Nurse B. Okon',
        notifyParents: true,
        followUpActions: 'X-ray examination required at orthopedic center',
      });

      expect(incident.id).toBeDefined();
      expect(incident.severity).toBe(IncidentSeverity.MAJOR);
      expect(incident.isHospitalReferralRequired).toBe(true);
      expect(incident.hospitalName).toBe('St. Nicholas Hospital Lagos');
      expect(incident.witnessStaffNames).toHaveLength(2);

      // Urgent parent alert queued
      expect(bullmqService.dispatch).toHaveBeenCalled();
    });

    it('lists health incidents filtered by severity', async () => {
      const majorIncidents = await clinicService.listHealthIncidents(tenantA, {
        severity: IncidentSeverity.MAJOR,
      });

      expect(majorIncidents).toHaveLength(1);
      expect(majorIncidents[0].incidentType).toContain('Fracture');
    });
  });

  describe('4. Clinic Analytics & Utilization Metrics', () => {
    it('calculates comprehensive clinic statistics and top complaint trends', async () => {
      const analytics = await clinicService.getClinicAnalytics(tenantA);

      expect(analytics.totalVisits).toBeGreaterThanOrEqual(1);
      expect(analytics.totalIncidents).toBeGreaterThanOrEqual(1);
      expect(analytics.criticalIncidentsCount).toBe(1);
      expect(analytics.totalMedicationsDispensed).toBe(1);
      expect(analytics.outcomesBreakdown[VisitOutcome.SENT_HOME_TO_PARENTS]).toBeGreaterThanOrEqual(1);
      expect(analytics.topComplaints.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('5. Multi-Tenant Security & Isolation', () => {
    it('ensures Tenant B cannot access Tenant A clinic records or incidents', async () => {
      const tenantBVisits = await clinicService.listClinicVisits(tenantB);
      expect(tenantBVisits).toHaveLength(0);

      const tenantBIncidents = await clinicService.listHealthIncidents(tenantB);
      expect(tenantBIncidents).toHaveLength(0);

      await expect(
        clinicService.recordClinicVisit(tenantB, {
          patientType: PatientType.STUDENT,
          patientId: student1, // Belongs to Tenant A
          visitType: VisitType.ROUTINE_CHECKUP,
          chiefComplaint: 'Routine check',
          outcome: VisitOutcome.DISCHARGED_TO_CLASS,
        }),
      ).rejects.toThrow();
    });
  });
});
