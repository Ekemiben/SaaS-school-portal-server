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
      const student = await this.prisma.student.findFirst({
        where: { id: dto.patientId, tenantId },
        include: {
          parents: {
            include: { parent: true },
          },
        },
      });
      if (!student) {
        throw new NotFoundException('Student patient not found');
      }
      patientName = `${student.firstName} ${student.lastName}`;
      admissionNumber = student.admissionNumber;

      const primaryParent = student.parents.find((sp) => sp.isPrimaryContact) || student.parents[0];
      parentEmail = primaryParent?.parent?.email || undefined;
    } else if (dto.patientType === PatientType.STAFF) {
      const user = await this.prisma.user.findFirst({
        where: { id: dto.patientId, tenantId },
      });
      if (user) patientName = `${user.firstName} ${user.lastName}`;
    }

    const visitId = `vst_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const outcome = (dto as any).status === 'Discharged' ? VisitOutcome.DISCHARGED_TO_CLASS : (dto.outcome || VisitOutcome.RESTING_IN_SICKBAY);
    const status = outcome === VisitOutcome.DISCHARGED_TO_CLASS ? 'Discharged' : 'Under Observation';
    const admittedAt = new Date();
    const dischargedAt = outcome === VisitOutcome.DISCHARGED_TO_CLASS ? new Date() : null;

    const record = await this.prisma.clinicVisit.create({
      data: {
        id: visitId,
        tenantId,
        studentId: dto.patientType === PatientType.STUDENT ? (dto.patientId || null) : null,
        patientType: dto.patientType || PatientType.STUDENT,
        patientId: dto.patientId || (dto as any).studentId || 'std_demo',
        patientName,
        admissionNumber,
        class: (dto as any).class || 'JSS 1A',
        visitType: dto.visitType || VisitType.ROUTINE_CHECKUP,
        chiefComplaint: (dto as any).complaint || dto.chiefComplaint,
        symptoms: dto.symptoms || [],
        vitals: (dto.vitals as any) || { temperature: (dto as any).temperature || 37.0 },
        temperature: (dto as any).temperature || '37.0°C',
        bloodGroup: (dto as any).bloodGroup || 'O+',
        allergies: (dto as any).allergies || 'None Reported',
        diagnosis: dto.diagnosis || (dto as any).diagnosis || null,
        treatmentGiven: dto.treatmentGiven || null,
        outcome,
        status,
        sickbayBedNumber: dto.sickbayBedNumber || null,
        attendedByStaffId: dto.attendedByStaffId || staffId || null,
        attendedByStaffName: (dto as any).officer || (dto as any).attendedBy || dto.attendedByStaffName || 'Nurse Mary (RN)',
        admittedAt,
        dischargedAt,
        parentNotified: (dto as any).parentNotified ?? true,
      },
    });

    // Cross-Module Trigger: Create In-App Inbox Notification for Linked Parent(s)
    if (record.parentNotified && (dto.patientType === PatientType.STUDENT || !dto.patientType)) {
      const studentIdentifier = record.patientId || (dto as any).studentId;
      try {
        const studentParents = await this.prisma.studentParent.findMany({
          where: {
            OR: [
              { studentId: studentIdentifier },
              { student: { tenantId, admissionNumber: studentIdentifier } },
              { student: { tenantId, id: studentIdentifier } },
            ],
          },
          include: { parent: { include: { user: true } } },
        });

        for (const sp of studentParents) {
          const parentUserId = sp.parent?.userId || sp.parent?.user?.id;
          if (parentUserId) {
            await this.prisma.inAppInboxItem.create({
              data: {
                id: `inb_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
                tenantId,
                recipientUserId: parentUserId,
                category: 'HEALTH_UPDATE',
                priority: 'HIGH',
                title: `School Clinic Visit: ${patientName}`,
                message: `${patientName} visited the clinic today for "${(record as any).chiefComplaint}". Status: ${record.status}. Attended by: ${record.attendedByStaffName}.`,
                actionUrl: '/parent',
                isRead: false,
              },
            });
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not dispatch in-app parent clinic notice: ${err.message}`);
      }
    }

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
    const visit = await this.prisma.clinicVisit.findFirst({
      where: { id: visitId, tenantId },
    });
    if (!visit) {
      throw new NotFoundException('Clinic visit record not found');
    }

    const outcome = dto?.outcome || 'DISCHARGED_TO_CLASS';
    const dischargedAt = dto?.dischargedAt ? new Date(dto.dischargedAt) : new Date();

    const updated = await this.prisma.clinicVisit.update({
      where: { id: visitId },
      data: {
        outcome,
        status: 'Discharged',
        dischargedAt,
        dischargeNotes: dto?.dischargeNotes || null,
      },
    });

    return this.enrichVisit(updated);
  }

  private enrichVisit(v: any) {
    return {
      ...v,
      student: v.patientName || v.student || 'Student',
      studentId: v.admissionNumber || v.studentId || v.patientId,
      class: v.class || v.patientClass || 'General',
      complaint: v.chiefComplaint || v.complaint || 'General Checkup',
      temperature: v.vitals?.temperature ? `${v.vitals.temperature}°C` : (v.temperature || '37.0°C'),
      bloodGroup: v.bloodGroup || null,
      allergies: v.allergies || 'None Reported',
      diagnosis: v.diagnosis || 'Under medical observation',
      date: v.admittedAt ? new Date(v.admittedAt).toISOString().split('T')[0] : (v.date || new Date().toISOString().split('T')[0]),
      officer: v.attendedByStaffName || v.officer || 'School Nurse',
      status: v.outcome === 'DISCHARGED_TO_CLASS' ? 'Discharged' : (v.status || 'Under Observation'),
      parentNotified: v.parentNotified ?? true,
    };
  }

  async listClinicVisits(tenantId: string, filters: ClinicVisitFilterDto = {}) {
    const where: any = { tenantId };

    if (filters.patientType) where.patientType = filters.patientType;
    if (filters.visitType) where.visitType = filters.visitType;
    if (filters.outcome) where.outcome = filters.outcome;
    if (filters.patientId) {
      where.OR = [
        { patientId: filters.patientId },
        { studentId: filters.patientId },
        { admissionNumber: filters.patientId },
      ];
    }

    const visits = await this.prisma.clinicVisit.findMany({
      where,
      orderBy: { admittedAt: 'desc' },
    });

    return visits.map((v) => this.enrichVisit(v));
  }

  async getClinicVisit(tenantId: string, visitId: string) {
    const visit = await this.prisma.clinicVisit.findFirst({
      where: { id: visitId, tenantId },
    });
    if (!visit) {
      throw new NotFoundException('Clinic visit record not found');
    }
    return this.enrichVisit(visit);
  }

  // --- Medication Dispensation ---
  async recordMedicationDispensation(tenantId: string, dto: RecordMedicationDispensationDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException('Student record not found');
    }

    const dispId = `dsp_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const record = await this.prisma.medicationDispensation.create({
      data: {
        id: dispId,
        tenantId,
        visitId: dto.visitId || null,
        studentId: dto.studentId,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        medicationName: dto.medicationName,
        dosage: dto.dosage,
        quantityDispensed: dto.quantityDispensed ?? 1,
        route: dto.route || 'ORAL',
        administeredAt: new Date(dto.administeredAt),
        administeredByStaffName: dto.administeredByStaffName,
        parentConsentVerified: dto.parentConsentVerified ?? true,
        batchNumber: dto.batchNumber || null,
        notes: dto.notes || null,
      },
    });

    return record;
  }

  async listMedicationDispensations(tenantId: string, studentId?: string) {
    const where: any = { tenantId };
    if (studentId) where.studentId = studentId;

    return this.prisma.medicationDispensation.findMany({
      where,
      orderBy: { administeredAt: 'desc' },
    });
  }

  // --- First Aid & Critical Incidents ---
  async logHealthIncident(tenantId: string, dto: CreateHealthIncidentDto, loggedByStaffId?: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
      include: {
        parents: {
          include: { parent: true },
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Student record not found');
    }

    const incidentId = `inc_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const record = await this.prisma.healthIncident.create({
      data: {
        id: incidentId,
        tenantId,
        studentId: dto.studentId,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        incidentType: dto.incidentType,
        severity: dto.severity || 'MINOR',
        location: dto.location || null,
        occurredAt: new Date(dto.occurredAt),
        description: dto.description,
        witnessStaffNames: dto.witnessStaffNames || [],
        immediateFirstAidGiven: dto.immediateFirstAidGiven || null,
        isHospitalReferralRequired: !!dto.isHospitalReferralRequired,
        hospitalName: dto.hospitalName || null,
        ambulanceCalled: !!dto.ambulanceCalled,
        escortStaffName: dto.escortStaffName || null,
        followUpActions: dto.followUpActions || null,
        loggedByStaffId: loggedByStaffId || null,
      },
    });

    // If major/critical or referred to hospital, dispatch immediate parent notification
    if (dto.notifyParents && this.queueService) {
      const primaryParent = student.parents.find((sp) => sp.isPrimaryContact) || student.parents[0];
      const parentEmail = primaryParent?.parent?.email;

      if (parentEmail) {
        await this.queueService.dispatch(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_EMAIL, {
          tenantId,
          data: {
            recipientEmail: parentEmail,
            title: `URGENT Health Incident Notice: ${student.firstName} ${student.lastName}`,
            message: `An incident (${dto.incidentType} - ${dto.severity}) occurred at ${dto.location}. First aid was administered. ${dto.isHospitalReferralRequired ? `Student referred to ${dto.hospitalName || 'hospital'}.` : ''}`,
          },
        });
      }
    }

    return record;
  }

  async listHealthIncidents(tenantId: string, filters: HealthIncidentFilterDto = {}) {
    const where: any = { tenantId };

    if (filters.severity) where.severity = filters.severity;
    if (filters.location) where.location = filters.location;
    if (filters.studentId) where.studentId = filters.studentId;

    return this.prisma.healthIncident.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
    });
  }

  // --- Clinic Analytics & Sickbay Utilization ---
  async getClinicAnalytics(tenantId: string) {
    const [visits, incidents, dispensations] = await Promise.all([
      this.prisma.clinicVisit.findMany({ where: { tenantId } }),
      this.prisma.healthIncident.findMany({ where: { tenantId } }),
      this.prisma.medicationDispensation.findMany({ where: { tenantId } }),
    ]);

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
      criticalIncidentsCount: incidents.filter(
        (i: any) => i.severity === IncidentSeverity.CRITICAL_EMERGENCY || i.severity === IncidentSeverity.MAJOR,
      ).length,
      totalMedicationsDispensed: dispensations.length,
      outcomesBreakdown: outcomesCount,
      topComplaints,
      generatedAt: new Date().toISOString(),
    };
  }
}
