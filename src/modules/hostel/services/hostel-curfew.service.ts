import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { QueueService } from '../../../jobs/queue.service.js';
import { QUEUES } from '../../../jobs/queue.constants.js';
import {
  CreateCurfewSessionDto,
  RecordCurfewAttendanceDto,
  CurfewFilterDto,
} from '../dto/curfew-session.dto.js';
import { HostelService } from './hostel.service.js';

@Injectable()
export class HostelCurfewService {
  private readonly logger = new Logger(HostelCurfewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hostelService: HostelService,
    private readonly queueService: QueueService,
  ) {}

  async createSession(
    tenantId: string,
    campusId: string,
    conductedByUserId: string,
    dto: CreateCurfewSessionDto,
  ) {
    const hostel = await this.hostelService.getHostelById(tenantId, dto.hostelId);

    const activeAllocations = await this.prisma.hostelAllocation.findMany({
      where: { tenantId, hostelId: dto.hostelId, status: 'ACTIVE' },
      include: {
        student: true,
        room: true,
        bed: true,
      },
    });

    const activeExeats = await this.prisma.hostelExeat.findMany({
      where: { tenantId, hostelId: dto.hostelId, status: 'DEPARTED' },
    });

    const departedStudentIds = new Set(activeExeats.map((e) => e.studentId));
    const totalExpected = activeAllocations.length;
    const totalOnExeat = activeAllocations.filter((a) => departedStudentIds.has(a.studentId)).length;

    const session = await this.prisma.hostelCurfewSession.create({
      data: {
        tenantId,
        campusId: dto.campusId || hostel.campusId || campusId,
        hostelId: dto.hostelId,
        sessionDate: dto.sessionDate ? new Date(dto.sessionDate) : new Date(),
        sessionType: dto.sessionType || 'NIGHT_CURFEW',
        conductedByUserId,
        status: 'IN_PROGRESS',
        totalExpected,
        totalPresent: 0,
        totalAbsent: 0,
        totalOnExeat,
        notes: dto.notes || null,
      },
    });

    return {
      ...session,
      hostelName: hostel.name,
      residents: activeAllocations.map((a) => ({
        studentId: a.studentId,
        studentName: a.student ? `${a.student.firstName} ${a.student.lastName}` : 'Student',
        admissionNumber: a.student?.admissionNumber,
        roomNumber: a.room?.roomNumber,
        bedNumber: a.bed?.bedNumber,
        isOnExeat: departedStudentIds.has(a.studentId),
      })),
    };
  }

  async recordAttendance(
    tenantId: string,
    sessionId: string,
    conductedByUserId: string,
    dto: RecordCurfewAttendanceDto,
  ) {
    const session = await this.prisma.hostelCurfewSession.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException(`Curfew session with ID ${sessionId} not found`);
    }

    let presentCount = 0;
    let absentCount = 0;
    let exeatCount = 0;
    const unexcusedAbsentees: string[] = [];

    for (const item of dto.attendances) {
      if (item.status === 'PRESENT' || item.status === 'LATE') {
        presentCount++;
      } else if (item.status === 'ABSENT_UNEXCUSED') {
        absentCount++;
        unexcusedAbsentees.push(item.studentId);
      } else if (item.status === 'EXEAT_ON_LEAVE') {
        exeatCount++;
      }

      await this.prisma.hostelCurfewAttendance.upsert({
        where: {
          sessionId_studentId: { sessionId, studentId: item.studentId },
        },
        create: {
          tenantId,
          campusId: session.campusId,
          sessionId,
          hostelId: session.hostelId,
          studentId: item.studentId,
          roomId: item.roomId || null,
          bedId: item.bedId || null,
          status: item.status,
          remarks: item.remarks || null,
          markedByUserId: conductedByUserId,
        },
        update: {
          status: item.status,
          remarks: item.remarks || null,
          markedByUserId: conductedByUserId,
        },
      });
    }

    const updatedSession = await this.prisma.hostelCurfewSession.update({
      where: { id: sessionId },
      data: {
        totalPresent: presentCount,
        totalAbsent: absentCount,
        totalOnExeat: exeatCount,
        status: 'COMPLETED',
        ...(dto.notes ? { notes: dto.notes } : {}),
      },
    });

    if (unexcusedAbsentees.length > 0) {
      this.dispatchTruancyAlert(tenantId, updatedSession, unexcusedAbsentees).catch((err) =>
        this.logger.warn(`Fault-isolated curfew truancy alert failed: ${err.message}`),
      );
    }

    return updatedSession;
  }

  async listCurfewSessions(tenantId: string, filter?: CurfewFilterDto) {
    const where: any = { tenantId };
    if (filter?.hostelId) where.hostelId = filter.hostelId;
    if (filter?.campusId) where.campusId = filter.campusId;
    if (filter?.sessionType) where.sessionType = filter.sessionType;
    if (filter?.status) where.status = filter.status;

    const list = await this.prisma.hostelCurfewSession.findMany({
      where,
      include: { hostel: true },
      orderBy: { sessionDate: 'desc' },
    });

    return list.map((s) => ({
      ...s,
      hostelName: s.hostel?.name || 'Hostel',
    }));
  }

  async getSessionById(tenantId: string, sessionId: string) {
    const session = await this.prisma.hostelCurfewSession.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        hostel: true,
        attendances: {
          include: { student: true },
        },
      },
    });
    if (!session) {
      throw new NotFoundException(`Curfew session with ID ${sessionId} not found`);
    }

    return {
      ...session,
      hostelName: session.hostel?.name || 'Hostel',
      attendances: session.attendances.map((a) => ({
        ...a,
        studentName: a.student ? `${a.student.firstName} ${a.student.lastName}` : 'Student',
        admissionNumber: a.student?.admissionNumber || '',
      })),
    };
  }

  private async dispatchTruancyAlert(
    tenantId: string,
    session: any,
    absenteeIds: string[],
  ) {
    try {
      const hostel = await this.prisma.hostel.findFirst({
        where: { id: session.hostelId, tenantId },
      });
      await this.queueService.addJob(
        QUEUES.NOTIFICATIONS,
        `curfew_truancy_${session.id}`,
        {
          tenantId,
          type: 'CURFEW_TRUANCY_ALERT',
          sessionId: session.id,
          hostelName: hostel?.name || 'Hostel',
          absenteeCount: absenteeIds.length,
          absenteeStudentIds: absenteeIds,
          sessionDate: session.sessionDate,
        },
      );
    } catch (e: any) {
      this.logger.warn(`Curfew truancy alert dispatch skipped: ${e?.message}`);
    }
  }
}
