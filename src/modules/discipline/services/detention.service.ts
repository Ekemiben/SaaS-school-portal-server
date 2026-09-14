import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateDetentionSessionDto,
  AssignStudentDetentionDto,
  RecordDetentionAttendanceDto,
} from '../dto/detention.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';

@Injectable()
export class DetentionService {
  private readonly logger = new Logger(DetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createSession(
    tenantId: string,
    supervisorUserId: string,
    dto: CreateDetentionSessionDto,
  ) {
    const campus = this.prisma.memoryStore.campuses.get(dto.campusId);
    if (!campus || campus.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Campus not found in this school',
      });
    }

    const id = `det_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const session = {
      id,
      tenantId,
      campusId: dto.campusId,
      title: dto.title,
      date: new Date(dto.date),
      startTime: dto.startTime,
      endTime: dto.endTime,
      location: dto.location,
      supervisorUserId: dto.supervisorUserId || supervisorUserId,
      maxCapacity: dto.maxCapacity || 30,
      status: 'SCHEDULED',
      notes: dto.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.detentionSessions.set(id, session);

    return {
      ...session,
      campusName: campus.name,
    };
  }

  async assignStudent(
    tenantId: string,
    assignerUserId: string,
    dto: AssignStudentDetentionDto,
  ) {
    const session = this.prisma.memoryStore.detentionSessions.get(dto.sessionId);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Detention session not found',
      });
    }

    if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      throw new BadRequestException({
        errorCode: ErrorCodes.VALIDATION_FAILED,
        message: `Cannot assign student to ${session.status.toLowerCase()} detention session`,
      });
    }

    const student = this.prisma.memoryStore.students.get(dto.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    const existingAssignments = Array.from(this.prisma.memoryStore.detentionAssignments.values()).filter(
      (a) => a.tenantId === tenantId && a.sessionId === dto.sessionId,
    );

    if (existingAssignments.some((a) => a.studentId === dto.studentId)) {
      throw new ConflictException({
        errorCode: ErrorCodes.CONFLICT,
        message: 'Student is already assigned to this detention session',
      });
    }

    if (existingAssignments.length >= session.maxCapacity) {
      throw new BadRequestException({
        errorCode: ErrorCodes.VALIDATION_FAILED,
        message: `Detention session is at full capacity (${session.maxCapacity} students)`,
      });
    }

    const id = `deta_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const assignment = {
      id,
      tenantId,
      sessionId: dto.sessionId,
      incidentId: dto.incidentId || null,
      studentId: dto.studentId,
      assignedByUserId: assignerUserId,
      attendanceStatus: 'ASSIGNED',
      reflectionNotes: dto.reflectionNotes || null,
      markedAt: null,
      markedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.detentionAssignments.set(id, assignment);

    return {
      ...assignment,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      sessionTitle: session.title,
    };
  }

  async recordAttendance(
    tenantId: string,
    assignmentId: string,
    supervisorUserId: string,
    dto: RecordDetentionAttendanceDto,
  ) {
    const assignment = this.prisma.memoryStore.detentionAssignments.get(assignmentId);
    if (!assignment || assignment.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Detention assignment not found',
      });
    }

    assignment.attendanceStatus = dto.attendanceStatus;
    if (dto.reflectionNotes) assignment.reflectionNotes = dto.reflectionNotes;
    assignment.markedAt = new Date();
    assignment.markedByUserId = supervisorUserId;
    assignment.updatedAt = new Date();

    this.prisma.memoryStore.detentionAssignments.set(assignmentId, assignment);

    return assignment;
  }

  async getSessions(tenantId: string, campusId?: string) {
    let list = Array.from(this.prisma.memoryStore.detentionSessions.values()).filter(
      (s) => s.tenantId === tenantId,
    );

    if (campusId) list = list.filter((s) => s.campusId === campusId);

    return list
      .map((s) => {
        const campus = this.prisma.memoryStore.campuses.get(s.campusId);
        const assignedCount = Array.from(this.prisma.memoryStore.detentionAssignments.values()).filter(
          (a) => a.tenantId === tenantId && a.sessionId === s.id,
        ).length;

        return {
          ...s,
          campusName: campus?.name || 'Campus',
          assignedCount,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async getSessionById(tenantId: string, sessionId: string) {
    const session = this.prisma.memoryStore.detentionSessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Detention session not found',
      });
    }

    const campus = this.prisma.memoryStore.campuses.get(session.campusId);
    const roster = Array.from(this.prisma.memoryStore.detentionAssignments.values())
      .filter((a) => a.tenantId === tenantId && a.sessionId === sessionId)
      .map((a) => {
        const student = this.prisma.memoryStore.students.get(a.studentId);
        return {
          ...a,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
          admissionNumber: student?.admissionNumber || '',
        };
      });

    return {
      ...session,
      campusName: campus?.name || 'Campus',
      assignedCount: roster.length,
      roster,
    };
  }
}
