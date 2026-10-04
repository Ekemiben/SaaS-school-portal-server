import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateDisciplinaryActionDto,
  UpdateActionStatusDto,
} from '../dto/disciplinary-action.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';

@Injectable()
export class DisciplinaryActionService {
  private readonly logger = new Logger(DisciplinaryActionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assignAction(
    tenantId: string,
    assignerUserId: string,
    dto: CreateDisciplinaryActionDto,
  ) {
    const incident = await this.prisma.disciplineIncident.findFirst({
      where: { id: dto.incidentId, tenantId },
    });
    if (!incident) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Associated discipline incident not found',
      });
    }

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    const action = await this.prisma.disciplinaryAction.create({
      data: {
        tenantId,
        incidentId: dto.incidentId,
        studentId: dto.studentId,
        assignedByUserId: assignerUserId,
        sanctionType: dto.sanctionType,
        title: dto.title,
        description: dto.description || null,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        status: 'SCHEDULED',
        parentNotified: dto.parentNotified || false,
      },
    });

    // Update incident status if currently REPORTED
    if (incident.status === 'REPORTED') {
      await this.prisma.disciplineIncident.update({
        where: { id: incident.id },
        data: { status: 'ACTION_PENDING' },
      });
    }

    return {
      ...action,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      incidentTitle: incident.title,
    };
  }

  async updateActionStatus(
    tenantId: string,
    actionId: string,
    verifierUserId: string,
    dto: UpdateActionStatusDto,
  ) {
    const action = await this.prisma.disciplinaryAction.findFirst({
      where: { id: actionId, tenantId },
    });
    if (!action) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Disciplinary action not found',
      });
    }

    const completedAt = dto.status === 'COMPLETED' ? new Date() : undefined;
    const verifiedByUserId = dto.status === 'COMPLETED' ? verifierUserId : undefined;

    return this.prisma.disciplinaryAction.update({
      where: { id: actionId },
      data: {
        status: dto.status,
        ...(dto.completionNotes !== undefined ? { completionNotes: dto.completionNotes } : {}),
        completedAt,
        verifiedByUserId,
      },
    });
  }

  async getActions(
    tenantId: string,
    filter: { studentId?: string; incidentId?: string; status?: string },
  ) {
    const where: any = { tenantId };

    if (filter.studentId) where.studentId = filter.studentId;
    if (filter.incidentId) where.incidentId = filter.incidentId;
    if (filter.status) where.status = filter.status;

    const actions = await this.prisma.disciplinaryAction.findMany({
      where,
      include: {
        student: true,
        incident: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return actions.map((a) => ({
      ...a,
      studentName: a.student ? `${a.student.firstName} ${a.student.lastName}` : 'Student',
      admissionNumber: a.student?.admissionNumber || '',
      incidentTitle: a.incident?.title || 'Incident',
    }));
  }

  async getActionById(tenantId: string, actionId: string) {
    const action = await this.prisma.disciplinaryAction.findFirst({
      where: { id: actionId, tenantId },
      include: {
        student: true,
        incident: true,
      },
    });
    if (!action) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Disciplinary action not found',
      });
    }

    return {
      ...action,
      studentName: action.student ? `${action.student.firstName} ${action.student.lastName}` : 'Student',
      admissionNumber: action.student?.admissionNumber || '',
      incidentTitle: action.incident?.title || 'Incident',
    };
  }
}
