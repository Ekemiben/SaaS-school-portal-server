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
    const incident = this.prisma.memoryStore.disciplineIncidents.get(dto.incidentId);
    if (!incident || incident.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Associated discipline incident not found',
      });
    }

    const student = this.prisma.memoryStore.students.get(dto.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    const id = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const action = {
      id,
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
      completionNotes: null,
      completedAt: null,
      verifiedByUserId: null,
      parentNotified: dto.parentNotified || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.disciplinaryActions.set(id, action);

    // Update incident status if currently REPORTED
    if (incident.status === 'REPORTED') {
      incident.status = 'ACTION_PENDING';
      incident.updatedAt = new Date();
      this.prisma.memoryStore.disciplineIncidents.set(incident.id, incident);
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
    const action = this.prisma.memoryStore.disciplinaryActions.get(actionId);
    if (!action || action.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Disciplinary action not found',
      });
    }

    action.status = dto.status;
    if (dto.completionNotes) action.completionNotes = dto.completionNotes;

    if (dto.status === 'COMPLETED') {
      action.completedAt = new Date();
      action.verifiedByUserId = verifierUserId;
    }

    action.updatedAt = new Date();
    this.prisma.memoryStore.disciplinaryActions.set(actionId, action);

    return action;
  }

  async getActions(
    tenantId: string,
    filter: { studentId?: string; incidentId?: string; status?: string },
  ) {
    let list = Array.from(this.prisma.memoryStore.disciplinaryActions.values()).filter(
      (a) => a.tenantId === tenantId,
    );

    if (filter.studentId) list = list.filter((a) => a.studentId === filter.studentId);
    if (filter.incidentId) list = list.filter((a) => a.incidentId === filter.incidentId);
    if (filter.status) list = list.filter((a) => a.status === filter.status);

    return list
      .map((a) => {
        const student = this.prisma.memoryStore.students.get(a.studentId);
        const incident = this.prisma.memoryStore.disciplineIncidents.get(a.incidentId);
        return {
          ...a,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
          admissionNumber: student?.admissionNumber || '',
          incidentTitle: incident?.title || 'Incident',
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getActionById(tenantId: string, actionId: string) {
    const action = this.prisma.memoryStore.disciplinaryActions.get(actionId);
    if (!action || action.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Disciplinary action not found',
      });
    }

    const student = this.prisma.memoryStore.students.get(action.studentId);
    const incident = this.prisma.memoryStore.disciplineIncidents.get(action.incidentId);

    return {
      ...action,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      admissionNumber: student?.admissionNumber || '',
      incidentTitle: incident?.title || 'Incident',
    };
  }
}
