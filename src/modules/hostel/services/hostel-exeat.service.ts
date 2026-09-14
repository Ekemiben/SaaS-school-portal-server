import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { QueueService } from '../../../jobs/queue.service.js';
import { QUEUES } from '../../../jobs/queue.constants.js';
import {
  CreateExeatPassDto,
  ApproveExeatPassDto,
  LogExeatDepartureDto,
  LogExeatReturnDto,
  ExeatFilterDto,
} from '../dto/exeat-pass.dto.js';

@Injectable()
export class HostelExeatService {
  private readonly logger = new Logger(HostelExeatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async requestExeat(
    tenantId: string,
    studentId: string,
    dto: CreateExeatPassDto,
  ) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student with ID ${studentId} not found`);
    }

    const hostel = this.prisma.memoryStore.hostels.get(dto.hostelId);
    if (!hostel || hostel.tenantId !== tenantId) {
      throw new NotFoundException(`Hostel with ID ${dto.hostelId} not found`);
    }

    const departureDate = new Date(dto.departureDate);
    const expectedReturnDate = new Date(dto.expectedReturnDate);

    if (expectedReturnDate <= departureDate) {
      throw new BadRequestException('Expected return date must be after departure date');
    }

    const id = `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const exeat = {
      id,
      tenantId,
      campusId: dto.campusId || hostel.campusId,
      hostelId: dto.hostelId,
      roomId: dto.roomId || null,
      studentId,
      exeatType: dto.exeatType,
      reason: dto.reason,
      destinationAddress: dto.destinationAddress,
      emergencyPhone: dto.emergencyPhone,
      accompanyingGuardian: dto.accompanyingGuardian || null,
      departureDate,
      expectedReturnDate,
      actualReturnDate: null,
      status: 'PENDING_APPROVAL',
      parentConsentStatus: dto.parentConsentStatus || 'PENDING',
      approvedByUserId: null,
      rejectionReason: null,
      checkoutNotes: null,
      checkinNotes: null,
      departureLoggedBy: null,
      returnLoggedBy: null,
      parentNotified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.hostelExeats.set(id, exeat);

    this.dispatchExeatNotification(tenantId, 'EXEAT_REQUESTED', exeat, student, hostel).catch((err) =>
      this.logger.warn(`Fault-isolated exeat notification failed: ${err.message}`),
    );

    return {
      ...exeat,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      hostelName: hostel.name,
    };
  }

  async approveOrRejectExeat(
    tenantId: string,
    exeatId: string,
    wardenUserId: string,
    dto: ApproveExeatPassDto,
  ) {
    const exeat = this.prisma.memoryStore.hostelExeats.get(exeatId);
    if (!exeat || exeat.tenantId !== tenantId) {
      throw new NotFoundException(`Exeat pass with ID ${exeatId} not found`);
    }

    if (exeat.status !== 'PENDING_APPROVAL' && exeat.status !== 'PENDING_PARENT_CONSENT') {
      throw new BadRequestException(`Cannot approve/reject exeat with status ${exeat.status}`);
    }

    const newStatus = dto.approved ? 'APPROVED' : 'REJECTED';
    exeat.status = newStatus;
    exeat.approvedByUserId = dto.approved ? wardenUserId : null;
    exeat.rejectionReason = !dto.approved ? dto.rejectionReason || 'Declined by warden' : null;
    if (dto.parentConsentStatus) exeat.parentConsentStatus = dto.parentConsentStatus;
    exeat.updatedAt = new Date();

    this.prisma.memoryStore.hostelExeats.set(exeatId, exeat);

    const student = this.prisma.memoryStore.students.get(exeat.studentId);
    const hostel = this.prisma.memoryStore.hostels.get(exeat.hostelId);

    this.dispatchExeatNotification(tenantId, newStatus, exeat, student, hostel).catch((err) =>
      this.logger.warn(`Fault-isolated exeat notification failed: ${err.message}`),
    );

    return {
      ...exeat,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      hostelName: hostel?.name || 'Hostel',
    };
  }

  async logDeparture(
    tenantId: string,
    exeatId: string,
    wardenUserId: string,
    dto: LogExeatDepartureDto,
  ) {
    const exeat = this.prisma.memoryStore.hostelExeats.get(exeatId);
    if (!exeat || exeat.tenantId !== tenantId) {
      throw new NotFoundException(`Exeat pass with ID ${exeatId} not found`);
    }

    if (exeat.status !== 'APPROVED') {
      throw new BadRequestException(`Only APPROVED exeats can be logged for departure (Current: ${exeat.status})`);
    }

    exeat.status = 'DEPARTED';
    exeat.departureDate = dto.departureDate ? new Date(dto.departureDate) : new Date();
    exeat.departureLoggedBy = wardenUserId;
    exeat.checkoutNotes = dto.checkoutNotes || null;
    exeat.parentNotified = true;
    exeat.updatedAt = new Date();

    this.prisma.memoryStore.hostelExeats.set(exeatId, exeat);

    const student = this.prisma.memoryStore.students.get(exeat.studentId);
    const hostel = this.prisma.memoryStore.hostels.get(exeat.hostelId);

    this.dispatchExeatNotification(tenantId, 'DEPARTED', exeat, student, hostel).catch((err) =>
      this.logger.warn(`Fault-isolated departure notification failed: ${err.message}`),
    );

    return {
      ...exeat,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      hostelName: hostel?.name || 'Hostel',
    };
  }

  async logReturn(
    tenantId: string,
    exeatId: string,
    wardenUserId: string,
    dto: LogExeatReturnDto,
  ) {
    const exeat = this.prisma.memoryStore.hostelExeats.get(exeatId);
    if (!exeat || exeat.tenantId !== tenantId) {
      throw new NotFoundException(`Exeat pass with ID ${exeatId} not found`);
    }

    if (exeat.status !== 'DEPARTED' && exeat.status !== 'OVERDUE') {
      throw new BadRequestException(`Only DEPARTED or OVERDUE exeats can be checked in (Current: ${exeat.status})`);
    }

    exeat.status = 'RETURNED';
    exeat.actualReturnDate = dto.actualReturnDate ? new Date(dto.actualReturnDate) : new Date();
    exeat.returnLoggedBy = wardenUserId;
    exeat.checkinNotes = dto.checkinNotes || null;
    exeat.updatedAt = new Date();

    this.prisma.memoryStore.hostelExeats.set(exeatId, exeat);

    const student = this.prisma.memoryStore.students.get(exeat.studentId);
    const hostel = this.prisma.memoryStore.hostels.get(exeat.hostelId);

    this.dispatchExeatNotification(tenantId, 'RETURNED', exeat, student, hostel).catch((err) =>
      this.logger.warn(`Fault-isolated return notification failed: ${err.message}`),
    );

    return {
      ...exeat,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      hostelName: hostel?.name || 'Hostel',
    };
  }

  async checkAndMarkOverdueExeats(tenantId: string) {
    const now = new Date();
    const overdueList = Array.from(this.prisma.memoryStore.hostelExeats.values()).filter(
      (e) => e.tenantId === tenantId && e.status === 'DEPARTED' && new Date(e.expectedReturnDate) < now,
    );

    const updated = [];
    for (const exeat of overdueList) {
      exeat.status = 'OVERDUE';
      exeat.updatedAt = new Date();
      this.prisma.memoryStore.hostelExeats.set(exeat.id, exeat);
      updated.push(exeat);

      const student = this.prisma.memoryStore.students.get(exeat.studentId);
      const hostel = this.prisma.memoryStore.hostels.get(exeat.hostelId);

      this.dispatchExeatNotification(tenantId, 'OVERDUE', exeat, student, hostel).catch((err) =>
        this.logger.warn(`Fault-isolated overdue alert failed: ${err.message}`),
      );
    }

    return updated;
  }

  async listExeats(tenantId: string, filter?: ExeatFilterDto) {
    let list = Array.from(this.prisma.memoryStore.hostelExeats.values()).filter(
      (e) => e.tenantId === tenantId,
    );

    if (filter?.studentId) list = list.filter((e) => e.studentId === filter.studentId);
    if (filter?.hostelId) list = list.filter((e) => e.hostelId === filter.hostelId);
    if (filter?.campusId) list = list.filter((e) => e.campusId === filter.campusId);
    if (filter?.exeatType) list = list.filter((e) => e.exeatType === filter.exeatType);
    if (filter?.status) list = list.filter((e) => e.status === filter.status);

    return list.map((e) => {
      const student = this.prisma.memoryStore.students.get(e.studentId);
      const hostel = this.prisma.memoryStore.hostels.get(e.hostelId);
      return {
        ...e,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
        admissionNumber: student?.admissionNumber || '',
        hostelName: hostel?.name || 'Hostel',
      };
    });
  }

  async getExeatById(tenantId: string, exeatId: string) {
    const exeat = this.prisma.memoryStore.hostelExeats.get(exeatId);
    if (!exeat || exeat.tenantId !== tenantId) {
      throw new NotFoundException(`Exeat pass with ID ${exeatId} not found`);
    }

    const student = this.prisma.memoryStore.students.get(exeat.studentId);
    const hostel = this.prisma.memoryStore.hostels.get(exeat.hostelId);

    return {
      ...exeat,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      admissionNumber: student?.admissionNumber || '',
      hostelName: hostel?.name || 'Hostel',
    };
  }

  private async dispatchExeatNotification(
    tenantId: string,
    event: string,
    exeat: any,
    student?: any,
    hostel?: any,
  ) {
    try {
      await this.queueService.addJob(
        QUEUES.NOTIFICATIONS,
        `exeat_${event.toLowerCase()}_${exeat.id}`,
        {
          tenantId,
          type: 'HOSTEL_EXEAT_ALERT',
          event,
          exeatId: exeat.id,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
          hostelName: hostel?.name || 'Hostel',
          departureDate: exeat.departureDate,
          expectedReturnDate: exeat.expectedReturnDate,
          status: exeat.status,
          emergencyPhone: exeat.emergencyPhone,
        },
      );
    } catch (e: any) {
      this.logger.warn(`Could not dispatch exeat notification: ${e?.message}`);
    }
  }
}
