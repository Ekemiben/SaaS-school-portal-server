import { Injectable, NotFoundException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { QueueService } from '../../../jobs/queue.service.js';
import { QUEUES, JOB_TYPES } from '../../../jobs/queue.constants.js';
import {
  CreateClinicVisitDto,
  DischargePatientDto,
  ClinicVisitFilterDto,
  PatientType,
  VisitType,
  VisitOutcome,
} from '../dto/clinic-visit.dto.js';
import { RecordMedicationDispensationDto } from '../dto/dispensation.dto.js';
import {
  CreateHealthIncidentDto,
  HealthIncidentFilterDto,
  IncidentSeverity,
} from '../dto/incident.dto.js';
import { randomUUID } from 'crypto';

@Injectable()
export class ClinicService {
  private readonly logger = new Logger(ClinicService.name);
  private readonly visits = new Map<string, any>();
  private readonly dispensations = new Map<string, any>();
  private readonly incidents = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly queueService?: QueueService,
  ) {}

  // --- Clinic Visits & Consultations ---
  async recordClinicVisit(tenantId: string, dto: CreateClinicVisitDto, staffId?: string) {
    let patientName = 'Patient';
    let admissionNumber: string | undefined;
    let parentEmail: string | undefined;

    if ((dto as any).student) {
      patientName = (dto as any).student;
      admissionNumber = (dto as any).studentId || 'STD-2025';
    } else if (dto.patientType === PatientType.STUDENT) {
      const student = this.prisma.memoryStore.students.get(dto.patientId);
      if (!student || student.tenantId !== tenantId) {
        throw new NotFoundException('Student patient not found');
      }
      patientName = `${student.firstName} ${student.lastName}`;
      admissionNumber = student.admissionNumber;

      const memory = this.prisma.memoryStore as any;
      const sp = Array.from(memory.studentParents?.values() || []).find(
        (item: any) => item.studentId === student.id,
      ) as any;
      if (sp) {
        const parent = this.prisma.memoryStore.parents.get(sp.parentId);
        parentEmail = parent?.email;
      }
    } else if (dto.patientType === PatientType.STAFF) {
      const user = this.prisma.memoryStore.users.get(dto.patientId);
      if (user) patientName = `${user.firstName} ${user.lastName}`;
    }

    const visitId = `vst_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const outcome = (dto as any).status === 'Discharged' ? VisitOutcome.DISCHARGED_TO_CLASS : (dto.outcome || VisitOutcome.RESTING_IN_SICKBAY);
    const record = {
      id: visitId,
      tenantId,
      patientType: dto.patientType || PatientType.STUDENT,
      patientId: dto.patientId || (dto as any).studentId || 'std_demo',
      patientName,
      student: patientName,
      studentId: admissionNumber,
      admissionNumber,
      class: (dto as any).class || 'JSS 1A',
      visitType: dto.visitType || VisitType.ROUTINE_CHECKUP,
      chiefComplaint: (dto as any).complaint || dto.chiefComplaint,
      complaint: (dto as any).complaint || dto.chiefComplaint,
      symptoms: dto.symptoms || [],
      vitals: dto.vitals || { temperature: (dto as any).temperature || 37.0 },
      temperature: (dto as any).temperature || '37.0°C',
      bloodGroup: (dto as any).bloodGroup || 'O+',
      allergies: (dto as any).allergies || 'None Reported',
      diagnosis: dto.diagnosis || (dto as any).diagnosis || null,
      treatmentGiven: dto.treatmentGiven || null,
      outcome,
      status: outcome === VisitOutcome.DISCHARGED_TO_CLASS ? 'Discharged' : 'Under Observation',
      sickbayBedNumber: dto.sickbayBedNumber || null,
      attendedByStaffId: dto.attendedByStaffId || staffId || null,
      attendedByStaffName: (dto as any).officer || dto.attendedByStaffName || 'Nurse Mary (RN)',
      officer: (dto as any).officer || dto.attendedByStaffName || 'Nurse Mary (RN)',
      admittedAt: new Date(),
      dischargedAt: outcome === VisitOutcome.DISCHARGED_TO_CLASS ? new Date() : null,
      parentNotified: (dto as any).parentNotified ?? true,
      createdAt: new Date(),
    };

    this.getVisitsMap().set(visitId, record);

    if (dto.notifyParents && parentEmail && this.queueService) {
      await this.queueService.dispatch(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
        tenantId,
        data: {
          recipientEmail: parentEmail,
          title: `School Clinic Visit Notification: ${patientName}`,
          message: `Your child ${patientName} visited the school clinic with complaint: ${dto.chiefComplaint}. Outcome: ${dto.outcome}.`,
        },
      });
    }

    return this.enrichVisit(record);
  }

  async dischargePatient(tenantId: string, visitId: string, dto?: DischargePatientDto) {
    const visitsMap = this.getVisitsMap();
    const visit = visitsMap.get(visitId);
    if (!visit || visit.tenantId !== tenantId) {
      throw new NotFoundException('Clinic visit record not found');
    }

    visit.outcome = dto?.outcome || 'DISCHARGED_TO_CLASS';
    visit.status = 'Discharged';
    visit.dischargedAt = dto?.dischargedAt ? new Date(dto.dischargedAt) : new Date();
    visit.dischargeNotes = dto?.dischargeNotes || null;
    visitsMap.set(visitId, visit);
    return this.enrichVisit(visit);
  }

  private getVisitsMap(): Map<string, any> {
    return (this.prisma.memoryStore as any)?.clinicVisits || this.visits;
  }

  private enrichVisit(v: any) {
    return {
      ...v,
      student: v.patientName || v.student || 'Student',
      studentId: v.admissionNumber || v.studentId || v.patientId,
      class: v.class || v.patientClass || 'JSS 1A',
      complaint: v.chiefComplaint || v.complaint || 'General Checkup',
      temperature: v.vitals?.temperature ? `${v.vitals.temperature}°C` : (v.temperature || '37.0°C'),
      bloodGroup: v.bloodGroup || 'O+',
      allergies: v.allergies || 'None Reported',
      diagnosis: v.diagnosis || 'Under medical observation',
      date: v.admittedAt ? new Date(v.admittedAt).toISOString().split('T')[0] : (v.date || '2025-09-08'),
      officer: v.attendedByStaffName || v.officer || 'Nurse Mary (RN)',
      status: v.outcome === 'DISCHARGED_TO_CLASS' ? 'Discharged' : (v.status || 'Under Observation'),
      parentNotified: v.parentNotified ?? true,
    };
  }

  async listClinicVisits(tenantId: string, filters: ClinicVisitFilterDto = {}) {
    const visitsMap = this.getVisitsMap();
    let result = Array.from(visitsMap.values()).filter((v: any) => v.tenantId === tenantId);

    if (filters.patientType) result = result.filter((v: any) => v.patientType === filters.patientType);
    if (filters.visitType) result = result.filter((v: any) => v.visitType === filters.visitType);
    if (filters.outcome) result = result.filter((v: any) => v.outcome === filters.outcome);
    if (filters.patientId) result = result.filter((v: any) => v.patientId === filters.patientId);

    const sorted = result.sort((a, b) => new Date(b.admittedAt || b.date).getTime() - new Date(a.admittedAt || a.date).getTime());
    return sorted.map((v) => this.enrichVisit(v));
  }

  async getClinicVisit(tenantId: string, visitId: string) {
    const visitsMap = this.getVisitsMap();
    const visit = visitsMap.get(visitId);
    if (!visit || visit.tenantId !== tenantId) {
      throw new NotFoundException('Clinic visit record not found');
    }
    return this.enrichVisit(visit);
  }

  // --- Medication Dispensation ---
  async recordMedicationDispensation(tenantId: string, dto: RecordMedicationDispensationDto) {
    const student = this.prisma.memoryStore.students.get(dto.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student record not found');
    }

    const dispId = `dsp_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const record = {
      id: dispId,
      tenantId,
      visitId: dto.visitId || null,
      studentId: dto.studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      medicationName: dto.medicationName,
      dosage: dto.dosage,
      quantityDispensed: dto.quantityDispensed,
      route: dto.route,
      administeredAt: new Date(dto.administeredAt),
      administeredByStaffName: dto.administeredByStaffName,
      parentConsentVerified: dto.parentConsentVerified,
      batchNumber: dto.batchNumber || null,
      notes: dto.notes || null,
      createdAt: new Date(),
    };

    this.dispensations.set(dispId, record);
    return record;
  }

  async listMedicationDispensations(tenantId: string, studentId?: string) {
    let list = Array.from(this.dispensations.values()).filter((d: any) => d.tenantId === tenantId);
    if (studentId) list = list.filter((d: any) => d.studentId === studentId);
    return list.sort((a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime());
  }

  // --- First Aid & Critical Incidents ---
  async logHealthIncident(tenantId: string, dto: CreateHealthIncidentDto, loggedByStaffId?: string) {
    const student = this.prisma.memoryStore.students.get(dto.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student record not found');
    }

    const incidentId = `inc_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const record = {
      id: incidentId,
      tenantId,
      studentId: dto.studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      incidentType: dto.incidentType,
      severity: dto.severity,
      location: dto.location,
      occurredAt: new Date(dto.occurredAt),
      description: dto.description,
      witnessStaffNames: dto.witnessStaffNames || [],
      immediateFirstAidGiven: dto.immediateFirstAidGiven,
      isHospitalReferralRequired: dto.isHospitalReferralRequired,
      hospitalName: dto.hospitalName || null,
      ambulanceCalled: !!dto.ambulanceCalled,
      escortStaffName: dto.escortStaffName || null,
      followUpActions: dto.followUpActions || null,
      loggedByStaffId: loggedByStaffId || null,
      createdAt: new Date(),
    };

    this.incidents.set(incidentId, record);

    // If major/critical or referred to hospital, dispatch immediate parent notification
    if (dto.notifyParents && this.queueService) {
      const memory = this.prisma.memoryStore as any;
      const sp = Array.from(memory.studentParents?.values() || []).find(
        (item: any) => item.studentId === student.id,
      ) as any;

      if (sp) {
        const parent = this.prisma.memoryStore.parents.get(sp.parentId);
        if (parent?.email) {
          await this.queueService.dispatch(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
            tenantId,
            data: {
              recipientEmail: parent.email,
              title: `URGENT Health Incident Notice: ${student.firstName} ${student.lastName}`,
              message: `An incident (${dto.incidentType} - ${dto.severity}) occurred at ${dto.location}. First aid was administered. ${dto.isHospitalReferralRequired ? `Student referred to ${dto.hospitalName || 'hospital'}.` : ''}`,
            },
          });
        }
      }
    }

    return record;
  }

  async listHealthIncidents(tenantId: string, filters: HealthIncidentFilterDto = {}) {
    let list = Array.from(this.incidents.values()).filter((i: any) => i.tenantId === tenantId);

    if (filters.severity) list = list.filter((i: any) => i.severity === filters.severity);
    if (filters.location) list = list.filter((i: any) => i.location === filters.location);
    if (filters.studentId) list = list.filter((i: any) => i.studentId === filters.studentId);

    return list.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }

  // --- Clinic Analytics & Sickbay Utilization ---
  async getClinicAnalytics(tenantId: string) {
    const visits = Array.from(this.getVisitsMap().values()).filter((v: any) => v.tenantId === tenantId);
    const incidents = Array.from(this.incidents.values()).filter((i: any) => i.tenantId === tenantId);
    const dispensations = Array.from(this.dispensations.values()).filter((d: any) => d.tenantId === tenantId);

    const outcomesCount = {
      [VisitOutcome.DISCHARGED_TO_CLASS]: 0,
      [VisitOutcome.RESTING_IN_SICKBAY]: 0,
      [VisitOutcome.SENT_HOME_TO_PARENTS]: 0,
      [VisitOutcome.REFERRED_TO_HOSPITAL]: 0,
    };

    const complaintFrequency = new Map<string, number>();
    for (const v of visits) {
      if (outcomesCount[v.outcome as VisitOutcome] !== undefined) {
        outcomesCount[v.outcome as VisitOutcome]++;
      }
      const complaint = v.chiefComplaint || 'Other';
      complaintFrequency.set(complaint, (complaintFrequency.get(complaint) || 0) + 1);
    }

    const topComplaints = Array.from(complaintFrequency.entries())
      .map(([complaint, count]) => ({ complaint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      tenantId,
      totalVisits: visits.length,
      totalIncidents: incidents.length,
      criticalIncidentsCount: incidents.filter((i: any) => i.severity === IncidentSeverity.CRITICAL_EMERGENCY || i.severity === IncidentSeverity.MAJOR).length,
      totalMedicationsDispensed: dispensations.length,
      outcomesBreakdown: outcomesCount,
      topComplaints,
      generatedAt: new Date().toISOString(),
    };
  }
}
