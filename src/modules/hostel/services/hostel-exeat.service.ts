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
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException(`Student with ID ${studentId} not found`);
    }

    const hostel = await this.prisma.hostel.findFirst({
      where: { id: dto.hostelId, tenantId },
    });
    if (!hostel) {
      throw new NotFoundException(`Hostel with ID ${dto.hostelId} not found`);
    }

    const departureDate = new Date(dto.departureDate);
    const expectedReturnDate = new Date(dto.expectedReturnDate);

    if (expectedReturnDate <= departureDate) {
      throw new BadRequestException('Expected return date must be after departure date');
    }

    const exeat = await this.prisma.hostelExeat.create({
      data: {
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
      },
    });

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
    const exeat = await this.prisma.hostelExeat.findFirst({
      where: { id: exeatId, tenantId },
      include: { student: true, hostel: true },
    });
    if (!exeat) {
      throw new NotFoundException(`Exeat pass with ID ${exeatId} not found`);
    }

    if (exeat.status !== 'PENDING_APPROVAL' && exeat.status !== 'PENDING_PARENT_CONSENT') {
      throw new BadRequestException(`Cannot approve/reject exeat with status ${exeat.status}`);
    }

    const newStatus = dto.approved ? 'APPROVED' : 'REJECTED';
    const updatedExeat = await this.prisma.hostelExeat.update({
      where: { id: exeatId },
      data: {
        status: newStatus,
        approvedByUserId: dto.approved ? wardenUserId : null,
        rejectionReason: !dto.approved ? dto.rejectionReason || 'Declined by warden' : null,
        ...(dto.parentConsentStatus ? { parentConsentStatus: dto.parentConsentStatus } : {}),
      },
    });

    this.dispatchExeatNotification(tenantId, newStatus, updatedExeat, exeat.student, exeat.hostel).catch((err) =>
      this.logger.warn(`Fault-isolated exeat notification failed: ${err.message}`),
    );

    return {
      ...updatedExeat,
      studentName: exeat.student ? `${exeat.student.firstName} ${exeat.student.lastName}` : 'Student',
      hostelName: exeat.hostel?.name || 'Hostel',
    };
  }

  async logDeparture(
    tenantId: string,
    exeatId: string,
    wardenUserId: string,
    dto: LogExeatDepartureDto,
  ) {
    const exeat = await this.prisma.hostelExeat.findFirst({
      where: { id: exeatId, tenantId },
      include: { student: true, hostel: true },
    });
    if (!exeat) {
      throw new NotFoundException(`Exeat pass with ID ${exeatId} not found`);
    }

    if (exeat.status !== 'APPROVED') {
      throw new BadRequestException(`Only APPROVED exeats can be logged for departure (Current: ${exeat.status})`);
    }

    const updatedExeat = await this.prisma.hostelExeat.update({
      where: { id: exeatId },
      data: {
        status: 'DEPARTED',
        departureDate: dto.departureDate ? new Date(dto.departureDate) : new Date(),
        departureLoggedBy: wardenUserId,
        checkoutNotes: dto.checkoutNotes || null,
        parentNotified: true,
      },
    });

    this.dispatchExeatNotification(tenantId, 'DEPARTED', updatedExeat, exeat.student, exeat.hostel).catch((err) =>
      this.logger.warn(`Fault-isolated departure notification failed: ${err.message}`),
    );

    return {
      ...updatedExeat,
      studentName: exeat.student ? `${exeat.student.firstName} ${exeat.student.lastName}` : 'Student',
      hostelName: exeat.hostel?.name || 'Hostel',
    };
  }

  async logReturn(
    tenantId: string,
    exeatId: string,
    wardenUserId: string,
    dto: LogExeatReturnDto,
  ) {
    const exeat = await this.prisma.hostelExeat.findFirst({
      where: { id: exeatId, tenantId },
      include: { student: true, hostel: true },
    });
    if (!exeat) {
      throw new NotFoundException(`Exeat pass with ID ${exeatId} not found`);
    }

    if (exeat.status !== 'DEPARTED' && exeat.status !== 'OVERDUE') {
      throw new BadRequestException(`Only DEPARTED or OVERDUE exeats can be checked in (Current: ${exeat.status})`);
    }

    const updatedExeat = await this.prisma.hostelExeat.update({
      where: { id: exeatId },
      data: {
        status: 'RETURNED',
        actualReturnDate: dto.actualReturnDate ? new Date(dto.actualReturnDate) : new Date(),
        returnLoggedBy: wardenUserId,
        checkinNotes: dto.checkinNotes || null,
      },
    });

    this.dispatchExeatNotification(tenantId, 'RETURNED', updatedExeat, exeat.student, exeat.hostel).catch((err) =>
      this.logger.warn(`Fault-isolated return notification failed: ${err.message}`),
    );

    return {
      ...updatedExeat,
      studentName: exeat.student ? `${exeat.student.firstName} ${exeat.student.lastName}` : 'Student',
      hostelName: exeat.hostel?.name || 'Hostel',
    };
  }

  async checkAndMarkOverdueExeats(tenantId: string) {
    const now = new Date();
    const overdueList = await this.prisma.hostelExeat.findMany({
      where: {
        tenantId,
        status: 'DEPARTED',
        expectedReturnDate: { lt: now },
      },
      include: { student: true, hostel: true },
    });

    const updated = [];
    for (const exeat of overdueList) {
      const updatedExeat = await this.prisma.hostelExeat.update({
        where: { id: exeat.id },
        data: { status: 'OVERDUE' },
      });
      updated.push(updatedExeat);

      this.dispatchExeatNotification(tenantId, 'OVERDUE', updatedExeat, exeat.student, exeat.hostel).catch((err) =>
        this.logger.warn(`Fault-isolated overdue alert failed: ${err.message}`),
      );
    }

    return updated;
  }

  async listExeats(tenantId: string, filter?: ExeatFilterDto) {
    const where: any = { tenantId };
    if (filter?.studentId) where.studentId = filter.studentId;
    if (filter?.hostelId) where.hostelId = filter.hostelId;
    if (filter?.campusId) where.campusId = filter.campusId;
    if (filter?.exeatType) where.exeatType = filter.exeatType;
    if (filter?.status) where.status = filter.status;

    const list = await this.prisma.hostelExeat.findMany({
      where,
      include: { student: true, hostel: true },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((e) => ({
      ...e,
      studentName: e.student ? `${e.student.firstName} ${e.student.lastName}` : 'Student',
      admissionNumber: e.student?.admissionNumber || '',
      hostelName: e.hostel?.name || 'Hostel',
    }));
  }

  async getExeatById(tenantId: string, exeatId: string) {
    const exeat = await this.prisma.hostelExeat.findFirst({
      where: { id: exeatId, tenantId },
      include: { student: true, hostel: true },
    });
    if (!exeat) {
      throw new NotFoundException(`Exeat pass with ID ${exeatId} not found`);
    }

    return {
      ...exeat,
      studentName: exeat.student ? `${exeat.student.firstName} ${exeat.student.lastName}` : 'Student',
      admissionNumber: exeat.student?.admissionNumber || '',
      hostelName: exeat.hostel?.name || 'Hostel',
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
