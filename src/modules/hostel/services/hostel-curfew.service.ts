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

    const activeAllocations = Array.from(
      this.prisma.memoryStore.hostelAllocations.values(),
    ).filter((a) => a.tenantId === tenantId && a.hostelId === dto.hostelId && a.status === 'ACTIVE');

    const activeExeats = Array.from(
      this.prisma.memoryStore.hostelExeats.values(),
    ).filter((e) => e.tenantId === tenantId && e.hostelId === dto.hostelId && e.status === 'DEPARTED');

    const departedStudentIds = new Set(activeExeats.map((e) => e.studentId));
    const totalExpected = activeAllocations.length;
    const totalOnExeat = activeAllocations.filter((a) => departedStudentIds.has(a.studentId)).length;

    const id = `cur_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const session = {
      id,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.hostelCurfewSessions.set(id, session);

    return {
      ...session,
      hostelName: hostel.name,
      residents: activeAllocations.map((a) => {
        const student = this.prisma.memoryStore.students.get(a.studentId);
        const room = this.prisma.memoryStore.hostelRooms.get(a.roomId);
        const bed = this.prisma.memoryStore.hostelBeds.get(a.bedId);
        return {
          studentId: a.studentId,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
          admissionNumber: student?.admissionNumber,
          roomNumber: room?.roomNumber,
          bedNumber: bed?.bedNumber,
          isOnExeat: departedStudentIds.has(a.studentId),
        };
      }),
    };
  }

  async recordAttendance(
    tenantId: string,
    sessionId: string,
    conductedByUserId: string,
    dto: RecordCurfewAttendanceDto,
  ) {
    const session = this.prisma.memoryStore.hostelCurfewSessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) {
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

      const attendanceKey = `${sessionId}_${item.studentId}`;
      const existingAttendance = this.prisma.memoryStore.hostelCurfewAttendances.get(attendanceKey);

      const attendanceRecord = {
        id: existingAttendance?.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
        createdAt: existingAttendance?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      this.prisma.memoryStore.hostelCurfewAttendances.set(attendanceKey, attendanceRecord);
    }

    session.totalPresent = presentCount;
    session.totalAbsent = absentCount;
    session.totalOnExeat = exeatCount;
    session.status = 'COMPLETED';
    if (dto.notes) session.notes = dto.notes;
    session.updatedAt = new Date();

    this.prisma.memoryStore.hostelCurfewSessions.set(sessionId, session);

    if (unexcusedAbsentees.length > 0) {
      this.dispatchTruancyAlert(tenantId, session, unexcusedAbsentees).catch((err) =>
        this.logger.warn(`Fault-isolated curfew truancy alert failed: ${err.message}`),
      );
    }

    return session;
  }

  async listCurfewSessions(tenantId: string, filter?: CurfewFilterDto) {
    let list = Array.from(this.prisma.memoryStore.hostelCurfewSessions.values()).filter(
      (s) => s.tenantId === tenantId,
    );

    if (filter?.hostelId) list = list.filter((s) => s.hostelId === filter.hostelId);
    if (filter?.campusId) list = list.filter((s) => s.campusId === filter.campusId);
    if (filter?.sessionType) list = list.filter((s) => s.sessionType === filter.sessionType);
    if (filter?.status) list = list.filter((s) => s.status === filter.status);

    return list.map((s) => {
      const hostel = this.prisma.memoryStore.hostels.get(s.hostelId);
      return {
        ...s,
        hostelName: hostel?.name || 'Hostel',
      };
    });
  }

  async getSessionById(tenantId: string, sessionId: string) {
    const session = this.prisma.memoryStore.hostelCurfewSessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException(`Curfew session with ID ${sessionId} not found`);
    }

    const hostel = this.prisma.memoryStore.hostels.get(session.hostelId);
    const attendances = Array.from(
      this.prisma.memoryStore.hostelCurfewAttendances.values(),
    )
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
      hostelName: hostel?.name || 'Hostel',
      attendances,
    };
  }

  private async dispatchTruancyAlert(
    tenantId: string,
    session: any,
    absenteeIds: string[],
  ) {
    try {
      const hostel = this.prisma.memoryStore.hostels.get(session.hostelId);
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
