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
    const campus = await this.prisma.campus.findFirst({
      where: { id: dto.campusId, tenantId },
    });
    if (!campus) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Campus not found in this school',
      });
    }

    const session = await this.prisma.detentionSession.create({
      data: {
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
      },
    });

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
    const session = await this.prisma.detentionSession.findFirst({
      where: { id: dto.sessionId, tenantId },
      include: {
        assignments: true,
      },
    });
    if (!session) {
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

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    const existingAssignment = await this.prisma.detentionAssignment.findFirst({
      where: {
        tenantId,
        sessionId: dto.sessionId,
        studentId: dto.studentId,
      },
    });

    if (existingAssignment) {
      throw new ConflictException({
        errorCode: ErrorCodes.CONFLICT,
        message: 'Student is already assigned to this detention session',
      });
    }

    if (session.assignments.length >= session.maxCapacity) {
      throw new BadRequestException({
        errorCode: ErrorCodes.VALIDATION_FAILED,
        message: `Detention session is at full capacity (${session.maxCapacity} students)`,
      });
    }

    const assignment = await this.prisma.detentionAssignment.create({
      data: {
        tenantId,
        sessionId: dto.sessionId,
        incidentId: dto.incidentId || null,
        studentId: dto.studentId,
        assignedByUserId: assignerUserId,
        attendanceStatus: 'ASSIGNED',
        reflectionNotes: dto.reflectionNotes || null,
      },
    });

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
    const assignment = await this.prisma.detentionAssignment.findFirst({
      where: { id: assignmentId, tenantId },
    });
    if (!assignment) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Detention assignment not found',
      });
    }

    return this.prisma.detentionAssignment.update({
      where: { id: assignmentId },
      data: {
        attendanceStatus: dto.attendanceStatus,
        ...(dto.reflectionNotes !== undefined ? { reflectionNotes: dto.reflectionNotes } : {}),
        markedAt: new Date(),
        markedByUserId: supervisorUserId,
      },
    });
  }

  async getSessions(tenantId: string, campusId?: string) {
    const where: any = { tenantId };
    if (campusId) where.campusId = campusId;

    const sessions = await this.prisma.detentionSession.findMany({
      where,
      include: {
        campus: true,
        _count: {
          select: { assignments: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    return sessions.map((s) => ({
      ...s,
      campusName: s.campus?.name || 'Campus',
      assignedCount: s._count?.assignments || 0,
    }));
  }

  async getSessionById(tenantId: string, sessionId: string) {
    const session = await this.prisma.detentionSession.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        campus: true,
        assignments: {
          include: {
            student: true,
          },
        },
      },
    });
    if (!session) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Detention session not found',
      });
    }

    const roster = session.assignments.map((a) => ({
      ...a,
      studentName: a.student ? `${a.student.firstName} ${a.student.lastName}` : 'Student',
      admissionNumber: a.student?.admissionNumber || '',
    }));

    return {
      ...session,
      campusName: session.campus?.name || 'Campus',
      assignedCount: roster.length,
      roster,
    };
  }
}
