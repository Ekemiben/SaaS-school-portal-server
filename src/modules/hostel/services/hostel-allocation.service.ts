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
    if ((dto as any).student) {
      const targetHostelId = dto.hostelId || (dto as any).hostelId;
      const targetHostel = this.prisma.memoryStore.hostels.get(targetHostelId);
      if (targetHostel) {
        targetHostel.occupiedBeds = (targetHostel.occupiedBeds || 0) + 1;
        if (!targetHostel.residents) targetHostel.residents = [];
        targetHostel.residents.push({
          student: (dto as any).student,
          class: (dto as any).class || 'JSS 1A',
          roomNumber: (dto as any).roomNumber || 'Room 101',
          bedSpace: (dto as any).bedSpace || 'Bed A (Lower)',
          dateJoined: new Date().toISOString().split('T')[0],
        });
        this.prisma.memoryStore.hostels.set(targetHostelId, targetHostel);
        return { success: true, message: 'Bed space allocated successfully', hostel: targetHostel };
      }
    }

    const student = this.prisma.memoryStore.students.get(dto.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student with ID ${dto.studentId} not found in this school`);
    }

    // Check existing active allocation
    const existingAllocation = Array.from(
      this.prisma.memoryStore.hostelAllocations.values(),
    ).find((a) => a.tenantId === tenantId && a.studentId === dto.studentId && a.status === 'ACTIVE');

    if (existingAllocation) {
      const existingHostel = this.prisma.memoryStore.hostels.get(existingAllocation.hostelId);
      const existingRoom = this.prisma.memoryStore.hostelRooms.get(existingAllocation.roomId);
      throw new BadRequestException(
        `Student already has an active bed allocation in ${existingHostel?.name || 'hostel'}, Room ${existingRoom?.roomNumber || ''}`,
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

    const id = `hal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const allocation = {
      id,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.hostelAllocations.set(id, allocation);

    // Update bed status to OCCUPIED
    bed.status = 'OCCUPIED';
    bed.updatedAt = new Date();
    this.prisma.memoryStore.hostelBeds.set(bed.id, bed);

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
    const currentAllocation = this.prisma.memoryStore.hostelAllocations.get(allocationId);
    if (!currentAllocation || currentAllocation.tenantId !== tenantId || currentAllocation.status !== 'ACTIVE') {
      throw new BadRequestException('Active allocation not found for transfer');
    }

    const newHostel = await this.hostelService.getHostelById(tenantId, dto.newHostelId);
    const newRoom = await this.hostelService.getRoomById(tenantId, dto.newRoomId);
    const newBed = await this.hostelService.getBedById(tenantId, dto.newBedId);

    if (newBed.status !== 'VACANT') {
      throw new BadRequestException(`Target bed ${newBed.bedNumber} is not vacant`);
    }

    // Vacate old bed
    const oldBed = this.prisma.memoryStore.hostelBeds.get(currentAllocation.bedId);
    if (oldBed) {
      oldBed.status = 'VACANT';
      oldBed.updatedAt = new Date();
      this.prisma.memoryStore.hostelBeds.set(oldBed.id, oldBed);
    }

    currentAllocation.status = 'TRANSFERRED';
    currentAllocation.actualEndDate = new Date();
    currentAllocation.checkoutReason = dto.transferReason || 'Transferred to another room/hostel';
    currentAllocation.updatedAt = new Date();
    this.prisma.memoryStore.hostelAllocations.set(allocationId, currentAllocation);

    await this.updateRoomOccupancy(tenantId, currentAllocation.roomId);
    await this.hostelService.recalculateHostelCounts(tenantId, currentAllocation.hostelId);

    // Create new allocation
    const id = `hal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newAllocation = {
      id,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.hostelAllocations.set(id, newAllocation);

    newBed.status = 'OCCUPIED';
    newBed.updatedAt = new Date();
    this.prisma.memoryStore.hostelBeds.set(newBed.id, newBed);

    await this.updateRoomOccupancy(tenantId, dto.newRoomId);
    await this.hostelService.recalculateHostelCounts(tenantId, dto.newHostelId);

    const student = this.prisma.memoryStore.students.get(currentAllocation.studentId);
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
    const allocation = this.prisma.memoryStore.hostelAllocations.get(allocationId);
    if (!allocation || allocation.tenantId !== tenantId || allocation.status !== 'ACTIVE') {
      throw new BadRequestException('Active allocation not found to vacate');
    }

    allocation.status = dto.status || 'VACATED';
    allocation.actualEndDate = dto.actualEndDate ? new Date(dto.actualEndDate) : new Date();
    allocation.checkoutReason = dto.checkoutReason || 'Normal checkout';
    if (dto.notes) allocation.notes = dto.notes;
    allocation.updatedAt = new Date();

    this.prisma.memoryStore.hostelAllocations.set(allocationId, allocation);

    const bed = this.prisma.memoryStore.hostelBeds.get(allocation.bedId);
    if (bed) {
      bed.status = 'VACANT';
      bed.updatedAt = new Date();
      this.prisma.memoryStore.hostelBeds.set(bed.id, bed);
    }

    await this.updateRoomOccupancy(tenantId, allocation.roomId);
    await this.hostelService.recalculateHostelCounts(tenantId, allocation.hostelId);

    return allocation;
  }

  async listAllocations(tenantId: string, filter?: AllocationFilterDto) {
    let list = Array.from(this.prisma.memoryStore.hostelAllocations.values()).filter(
      (a) => a.tenantId === tenantId,
    );

    if (filter?.studentId) list = list.filter((a) => a.studentId === filter.studentId);
    if (filter?.hostelId) list = list.filter((a) => a.hostelId === filter.hostelId);
    if (filter?.roomId) list = list.filter((a) => a.roomId === filter.roomId);
    if (filter?.campusId) list = list.filter((a) => a.campusId === filter.campusId);
    if (filter?.status) list = list.filter((a) => a.status === filter.status);
    if (filter?.academicSessionId) list = list.filter((a) => a.academicSessionId === filter.academicSessionId);

    return list.map((a) => {
      const student = this.prisma.memoryStore.students.get(a.studentId);
      const hostel = this.prisma.memoryStore.hostels.get(a.hostelId);
      const room = this.prisma.memoryStore.hostelRooms.get(a.roomId);
      const bed = this.prisma.memoryStore.hostelBeds.get(a.bedId);

      return {
        ...a,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
        admissionNumber: student?.admissionNumber || '',
        hostelName: hostel?.name || 'Hostel',
        roomNumber: room?.roomNumber || 'Room',
        bedNumber: bed?.bedNumber || 'Bed',
      };
    });
  }

  async getActiveAllocationByStudent(tenantId: string, studentId: string) {
    const allocation = Array.from(this.prisma.memoryStore.hostelAllocations.values()).find(
      (a) => a.tenantId === tenantId && a.studentId === studentId && a.status === 'ACTIVE',
    );
    if (!allocation) return null;

    const student = this.prisma.memoryStore.students.get(allocation.studentId);
    const hostel = this.prisma.memoryStore.hostels.get(allocation.hostelId);
    const room = this.prisma.memoryStore.hostelRooms.get(allocation.roomId);
    const bed = this.prisma.memoryStore.hostelBeds.get(allocation.bedId);

    return {
      ...allocation,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      admissionNumber: student?.admissionNumber || '',
      hostelName: hostel?.name || 'Hostel',
      roomNumber: room?.roomNumber || 'Room',
      bedNumber: bed?.bedNumber || 'Bed',
    };
  }

  private async updateRoomOccupancy(tenantId: string, roomId: string) {
    const room = this.prisma.memoryStore.hostelRooms.get(roomId);
    if (!room || room.tenantId !== tenantId) return;

    const beds = Array.from(this.prisma.memoryStore.hostelBeds.values()).filter(
      (b) => b.tenantId === tenantId && b.roomId === roomId,
    );
    const occupied = beds.filter((b) => b.status === 'OCCUPIED').length;
    room.occupied = occupied;
    room.status = occupied >= room.capacity ? 'FULL' : 'AVAILABLE';
    room.updatedAt = new Date();

    this.prisma.memoryStore.hostelRooms.set(roomId, room);
  }
}
