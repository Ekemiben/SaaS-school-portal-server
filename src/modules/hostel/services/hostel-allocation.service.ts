import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  AllocateBedDto,
  TransferBedDto,
  VacateBedDto,
  AllocationFilterDto,
} from '../dto/allocate-bed.dto.js';
import { HostelService } from './hostel.service.js';

@Injectable()
export class HostelAllocationService {
  private readonly logger = new Logger(HostelAllocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hostelService: HostelService,
  ) {}

  async allocateBed(
    tenantId: string,
    campusId: string,
    userId: string,
    dto: AllocateBedDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException(`Student with ID ${dto.studentId} not found in this school`);
    }

    // Check existing active allocation
    const existingAllocation = await this.prisma.hostelAllocation.findFirst({
      where: { tenantId, studentId: dto.studentId, status: 'ACTIVE' },
      include: { hostel: true, room: true },
    });

    if (existingAllocation) {
      throw new BadRequestException(
        `Student already has an active bed allocation in ${existingAllocation.hostel?.name || 'hostel'}, Room ${existingAllocation.room?.roomNumber || ''}`,
      );
    }

    const hostel = await this.hostelService.getHostelById(tenantId, dto.hostelId);
    const room = await this.hostelService.getRoomById(tenantId, dto.roomId);
    const bed = await this.hostelService.getBedById(tenantId, dto.bedId);

    if (bed.status !== 'VACANT') {
      throw new BadRequestException(`Bed ${bed.bedNumber} is currently not vacant (Status: ${bed.status})`);
    }

    // Gender check
    if (hostel.gender === 'BOYS' && student.gender?.toUpperCase() === 'FEMALE') {
      throw new BadRequestException('Cannot allocate female student to a Boys hostel');
    }
    if (hostel.gender === 'GIRLS' && student.gender?.toUpperCase() === 'MALE') {
      throw new BadRequestException('Cannot allocate male student to a Girls hostel');
    }

    const allocation = await this.prisma.hostelAllocation.create({
      data: {
        tenantId,
        campusId: dto.campusId || hostel.campusId || campusId,
        hostelId: dto.hostelId,
        roomId: dto.roomId,
        bedId: dto.bedId,
        studentId: dto.studentId,
        academicSessionId: dto.academicSessionId || null,
        academicTermId: dto.academicTermId || null,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        expectedEndDate: dto.expectedEndDate ? new Date(dto.expectedEndDate) : null,
        actualEndDate: null,
        status: 'ACTIVE',
        allocatedByUserId: userId,
        checkoutReason: null,
        notes: dto.notes || null,
      },
    });

    // Update bed status to OCCUPIED
    await this.prisma.hostelBed.update({
      where: { id: bed.id },
      data: { status: 'OCCUPIED' },
    });

    // Update room and hostel occupancy
    await this.updateRoomOccupancy(tenantId, dto.roomId);
    await this.hostelService.recalculateHostelCounts(tenantId, dto.hostelId);

    this.logger.log(`Allocated student ${student.admissionNumber} to bed ${bed.bedNumber} in ${hostel.name}`);
    return {
      ...allocation,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      hostelName: hostel.name,
      roomNumber: room.roomNumber,
      bedNumber: bed.bedNumber,
    };
  }

  async transferBed(
    tenantId: string,
    allocationId: string,
    userId: string,
    dto: TransferBedDto,
  ) {
    const currentAllocation = await this.prisma.hostelAllocation.findFirst({
      where: { id: allocationId, tenantId, status: 'ACTIVE' },
      include: { student: true },
    });
    if (!currentAllocation) {
      throw new BadRequestException('Active allocation not found for transfer');
    }

    const newHostel = await this.hostelService.getHostelById(tenantId, dto.newHostelId);
    const newRoom = await this.hostelService.getRoomById(tenantId, dto.newRoomId);
    const newBed = await this.hostelService.getBedById(tenantId, dto.newBedId);

    if (newBed.status !== 'VACANT') {
      throw new BadRequestException(`Target bed ${newBed.bedNumber} is not vacant`);
    }

    // Vacate old bed
    await this.prisma.hostelBed.updateMany({
      where: { id: currentAllocation.bedId, tenantId },
      data: { status: 'VACANT' },
    });

    await this.prisma.hostelAllocation.update({
      where: { id: allocationId },
      data: {
        status: 'TRANSFERRED',
        actualEndDate: new Date(),
        checkoutReason: dto.transferReason || 'Transferred to another room/hostel',
      },
    });

    await this.updateRoomOccupancy(tenantId, currentAllocation.roomId);
    await this.hostelService.recalculateHostelCounts(tenantId, currentAllocation.hostelId);

    // Create new allocation
    const newAllocation = await this.prisma.hostelAllocation.create({
      data: {
        tenantId,
        campusId: newHostel.campusId,
        hostelId: dto.newHostelId,
        roomId: dto.newRoomId,
        bedId: dto.newBedId,
        studentId: currentAllocation.studentId,
        academicSessionId: currentAllocation.academicSessionId,
        academicTermId: currentAllocation.academicTermId,
        startDate: new Date(),
        expectedEndDate: null,
        actualEndDate: null,
        status: 'ACTIVE',
        allocatedByUserId: userId,
        checkoutReason: null,
        notes: dto.notes || 'Transferred',
      },
    });

    await this.prisma.hostelBed.update({
      where: { id: newBed.id },
      data: { status: 'OCCUPIED' },
    });

    await this.updateRoomOccupancy(tenantId, dto.newRoomId);
    await this.hostelService.recalculateHostelCounts(tenantId, dto.newHostelId);

    const student = currentAllocation.student;
    return {
      ...newAllocation,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      admissionNumber: student?.admissionNumber || '',
      hostelName: newHostel.name,
      roomNumber: newRoom.roomNumber,
      bedNumber: newBed.bedNumber,
    };
  }

  async vacateBed(tenantId: string, allocationId: string, dto: VacateBedDto) {
    const allocation = await this.prisma.hostelAllocation.findFirst({
      where: { id: allocationId, tenantId, status: 'ACTIVE' },
    });
    if (!allocation) {
      throw new BadRequestException('Active allocation not found to vacate');
    }

    const updatedAllocation = await this.prisma.hostelAllocation.update({
      where: { id: allocationId },
      data: {
        status: dto.status || 'VACATED',
        actualEndDate: dto.actualEndDate ? new Date(dto.actualEndDate) : new Date(),
        checkoutReason: dto.checkoutReason || 'Normal checkout',
        ...(dto.notes ? { notes: dto.notes } : {}),
      },
    });

    await this.prisma.hostelBed.updateMany({
      where: { id: allocation.bedId, tenantId },
      data: { status: 'VACANT' },
    });

    await this.updateRoomOccupancy(tenantId, allocation.roomId);
    await this.hostelService.recalculateHostelCounts(tenantId, allocation.hostelId);

    return updatedAllocation;
  }

  async listAllocations(tenantId: string, filter?: AllocationFilterDto) {
    const where: any = { tenantId };
    if (filter?.studentId) where.studentId = filter.studentId;
    if (filter?.hostelId) where.hostelId = filter.hostelId;
    if (filter?.roomId) where.roomId = filter.roomId;
    if (filter?.campusId) where.campusId = filter.campusId;
    if (filter?.status) where.status = filter.status;
    if (filter?.academicSessionId) where.academicSessionId = filter.academicSessionId;

    const list = await this.prisma.hostelAllocation.findMany({
      where,
      include: {
        student: true,
        hostel: true,
        room: true,
        bed: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((a) => ({
      ...a,
      studentName: a.student ? `${a.student.firstName} ${a.student.lastName}` : 'Student',
      admissionNumber: a.student?.admissionNumber || '',
      hostelName: a.hostel?.name || 'Hostel',
      roomNumber: a.room?.roomNumber || 'Room',
      bedNumber: a.bed?.bedNumber || 'Bed',
    }));
  }

  async getActiveAllocationByStudent(tenantId: string, studentId: string) {
    const allocation = await this.prisma.hostelAllocation.findFirst({
      where: { tenantId, studentId, status: 'ACTIVE' },
      include: {
        student: true,
        hostel: true,
        room: true,
        bed: true,
      },
    });
    if (!allocation) return null;

    return {
      ...allocation,
      studentName: allocation.student ? `${allocation.student.firstName} ${allocation.student.lastName}` : 'Student',
      admissionNumber: allocation.student?.admissionNumber || '',
      hostelName: allocation.hostel?.name || 'Hostel',
      roomNumber: allocation.room?.roomNumber || 'Room',
      bedNumber: allocation.bed?.bedNumber || 'Bed',
    };
  }

  private async updateRoomOccupancy(tenantId: string, roomId: string) {
    const room = await this.prisma.hostelRoom.findFirst({
      where: { id: roomId, tenantId },
    });
    if (!room) return;

    const occupied = await this.prisma.hostelBed.count({
      where: { tenantId, roomId, status: 'OCCUPIED' },
    });

    await this.prisma.hostelRoom.update({
      where: { id: roomId },
      data: {
        occupied,
        status: occupied >= room.capacity ? 'FULL' : 'AVAILABLE',
      },
    });
  }
}
