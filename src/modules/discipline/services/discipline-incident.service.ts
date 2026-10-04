import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { class: true },
          take: 1,
        },
      },
    });
    if (!student) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    const campusId = dto.campusId || student.campusId;
    const classId = dto.classId || (student.enrollments[0]?.classId ?? student.campusId);

    const classRecord = await this.prisma.class.findFirst({
      where: { id: classId, tenantId },
    });
    const incidentCode = `INC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const incident = await this.prisma.disciplineIncident.create({
      data: {
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
      },
    });

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
    const where: any = { tenantId };

    if (filter.studentId) where.studentId = filter.studentId;
    if (filter.classId) where.classId = filter.classId;
    if (filter.campusId) where.campusId = filter.campusId;
    if (filter.category) where.category = filter.category;
    if (filter.severity) where.severity = filter.severity;
    if (filter.status) where.status = filter.status;
    if (filter.search) {
      const q = filter.search;
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { incidentCode: { contains: q, mode: 'insensitive' } },
      ];
    }

    const incidents = await this.prisma.disciplineIncident.findMany({
      where,
      include: {
        student: true,
        class: true,
      },
      orderBy: { incidentDate: 'desc' },
    });

    return incidents.map((i) => ({
      ...i,
      studentName: i.student ? `${i.student.firstName} ${i.student.lastName}` : 'Student',
      admissionNumber: i.student?.admissionNumber || '',
      className: i.class?.name || 'Class',
    }));
  }

  async getIncidentById(tenantId: string, id: string) {
    const incident = await this.prisma.disciplineIncident.findFirst({
      where: { id, tenantId },
      include: {
        student: true,
        class: true,
        actions: true,
      },
    });
    if (!incident) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Discipline incident record not found',
      });
    }

    return {
      ...incident,
      studentName: incident.student ? `${incident.student.firstName} ${incident.student.lastName}` : 'Student',
      admissionNumber: incident.student?.admissionNumber || '',
      className: incident.class?.name || 'Class',
      actions: incident.actions || [],
    };
  }

  async updateIncident(tenantId: string, id: string, dto: UpdateDisciplineIncidentDto) {
    const existing = await this.getIncidentById(tenantId, id);

    let parentNotifiedAt = existing.parentNotifiedAt;
    if (dto.parentNotified !== undefined) {
      if (dto.parentNotified && !parentNotifiedAt) {
        parentNotifiedAt = new Date();
      }
    }

    return this.prisma.disciplineIncident.update({
      where: { id },
      data: {
        ...dto,
        incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : undefined,
        parentNotifiedAt,
      },
    });
  }

  async resolveIncident(
    tenantId: string,
    id: string,
    resolverUserId: string,
    dto: ResolveIncidentDto,
  ) {
    await this.getIncidentById(tenantId, id);

    return this.prisma.disciplineIncident.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolutionNotes: dto.resolutionNotes || 'Incident resolved after review',
        resolvedAt: new Date(),
        resolvedByUserId: resolverUserId,
        ...(dto.notifyParent ? { parentNotified: true, parentNotifiedAt: new Date() } : {}),
      },
    });
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
