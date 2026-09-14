import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateDisciplineIncidentDto,
  IncidentFilterDto,
} from '../dto/create-incident.dto.js';
import {
  UpdateDisciplineIncidentDto,
  ResolveIncidentDto,
} from '../dto/update-incident.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';
import { QueueService } from '../../../jobs/queue.service.js';
import { QUEUES } from '../../../jobs/queue.constants.js';

@Injectable()
export class DisciplineIncidentService {
  private readonly logger = new Logger(DisciplineIncidentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async reportIncident(
    tenantId: string,
    reporterUserId: string,
    dto: CreateDisciplineIncidentDto,
  ) {
    const student = this.prisma.memoryStore.students.get(dto.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    const campusId = dto.campusId || student.campusId;
    const classId = dto.classId || student.classId;

    const classRecord = this.prisma.memoryStore.classes.get(classId);
    const id = `dis_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const incidentCode = `INC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const incident = {
      id,
      tenantId,
      campusId,
      classId,
      studentId: dto.studentId,
      academicYearId: dto.academicYearId || classRecord?.academicYearId || null,
      termId: dto.termId || null,
      reportedByUserId: reporterUserId,
      incidentCode,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      severity: dto.severity || 'MINOR',
      demeritPoints: dto.demeritPoints ?? 1,
      location: dto.location || null,
      incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : new Date(),
      status: 'REPORTED',
      witnessNames: dto.witnessNames || [],
      evidenceUrls: dto.evidenceUrls || [],
      parentNotified: dto.parentNotified || false,
      parentNotifiedAt: dto.parentNotified ? new Date() : null,
      resolutionNotes: null,
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.disciplineIncidents.set(id, incident);

    if (incident.parentNotified) {
      this.dispatchParentIncidentAlert(tenantId, incident, student).catch((err) =>
        this.logger.warn(`Parent alert queueing failed safely: ${err.message}`),
      );
    }

    return {
      ...incident,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      className: classRecord?.name || 'Class',
    };
  }

  async getIncidents(tenantId: string, filter: IncidentFilterDto) {
    let list = Array.from(this.prisma.memoryStore.disciplineIncidents.values()).filter(
      (i) => i.tenantId === tenantId,
    );

    if (filter.studentId) list = list.filter((i) => i.studentId === filter.studentId);
    if (filter.classId) list = list.filter((i) => i.classId === filter.classId);
    if (filter.campusId) list = list.filter((i) => i.campusId === filter.campusId);
    if (filter.category) list = list.filter((i) => i.category === filter.category);
    if (filter.severity) list = list.filter((i) => i.severity === filter.severity);
    if (filter.status) list = list.filter((i) => i.status === filter.status);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.incidentCode?.toLowerCase().includes(q),
      );
    }

    return list
      .map((i) => {
        const student = this.prisma.memoryStore.students.get(i.studentId);
        const cls = this.prisma.memoryStore.classes.get(i.classId);
        return {
          ...i,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
          admissionNumber: student?.admissionNumber || '',
          className: cls?.name || 'Class',
        };
      })
      .sort((a, b) => new Date(b.incidentDate).getTime() - new Date(a.incidentDate).getTime());
  }

  async getIncidentById(tenantId: string, id: string) {
    const incident = this.prisma.memoryStore.disciplineIncidents.get(id);
    if (!incident || incident.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Discipline incident record not found',
      });
    }

    const student = this.prisma.memoryStore.students.get(incident.studentId);
    const cls = this.prisma.memoryStore.classes.get(incident.classId);
    const actions = Array.from(this.prisma.memoryStore.disciplinaryActions.values()).filter(
      (a) => a.tenantId === tenantId && a.incidentId === id,
    );

    return {
      ...incident,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      admissionNumber: student?.admissionNumber || '',
      className: cls?.name || 'Class',
      actions,
    };
  }

  async updateIncident(tenantId: string, id: string, dto: UpdateDisciplineIncidentDto) {
    const incident = await this.getIncidentById(tenantId, id);

    if (dto.title !== undefined) incident.title = dto.title;
    if (dto.description !== undefined) incident.description = dto.description;
    if (dto.category !== undefined) incident.category = dto.category;
    if (dto.severity !== undefined) incident.severity = dto.severity;
    if (dto.demeritPoints !== undefined) incident.demeritPoints = dto.demeritPoints;
    if (dto.location !== undefined) incident.location = dto.location;
    if (dto.incidentDate !== undefined) incident.incidentDate = new Date(dto.incidentDate);
    if (dto.status !== undefined) incident.status = dto.status;
    if (dto.witnessNames !== undefined) incident.witnessNames = dto.witnessNames;
    if (dto.evidenceUrls !== undefined) incident.evidenceUrls = dto.evidenceUrls;
    if (dto.parentNotified !== undefined) {
      incident.parentNotified = dto.parentNotified;
      if (dto.parentNotified && !incident.parentNotifiedAt) {
        incident.parentNotifiedAt = new Date();
      }
    }
    if (dto.resolutionNotes !== undefined) incident.resolutionNotes = dto.resolutionNotes;

    incident.updatedAt = new Date();
    this.prisma.memoryStore.disciplineIncidents.set(id, incident);

    return incident;
  }

  async resolveIncident(
    tenantId: string,
    id: string,
    resolverUserId: string,
    dto: ResolveIncidentDto,
  ) {
    const incident = await this.getIncidentById(tenantId, id);

    incident.status = 'RESOLVED';
    incident.resolutionNotes = dto.resolutionNotes || 'Incident resolved after review';
    incident.resolvedAt = new Date();
    incident.resolvedByUserId = resolverUserId;
    if (dto.notifyParent) {
      incident.parentNotified = true;
      incident.parentNotifiedAt = new Date();
    }
    incident.updatedAt = new Date();

    this.prisma.memoryStore.disciplineIncidents.set(id, incident);

    return incident;
  }

  private async dispatchParentIncidentAlert(tenantId: string, incident: any, student: any) {
    try {
      await this.queueService.addJob(
        QUEUES.NOTIFICATIONS,
        'discipline_incident_parent_alert',
        {
          tenantId,
          type: 'DISCIPLINE_INCIDENT_REPORTED',
          incidentId: incident.id,
          studentId: student.id,
          incidentTitle: incident.title,
          category: incident.category,
          severity: incident.severity,
          demeritPoints: incident.demeritPoints,
          date: incident.incidentDate,
        },
      );
    } catch (err: any) {
      this.logger.warn(`Discipline incident notification failed safely: ${err.message}`);
    }
  }
}
