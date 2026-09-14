import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateHostelDto,
  UpdateHostelDto,
  CreateHostelRoomDto,
  UpdateHostelRoomDto,
  CreateHostelBedDto,
  UpdateHostelBedDto,
} from '../dto/create-hostel.dto.js';
import {
  HostelFilterDto,
  RoomFilterDto,
  BedFilterDto,
} from '../dto/hostel-filter.dto.js';

@Injectable()
export class HostelService {
  private readonly logger = new Logger(HostelService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createHostel(tenantId: string, campusId: string, dto: CreateHostelDto) {
    const targetCampusId = dto.campusId || campusId;
    const id = `hst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const hostel = {
      id,
      tenantId,
      campusId: targetCampusId,
      name: dto.name,
      code: dto.code || `HST-${Math.floor(100 + Math.random() * 900)}`,
      gender: dto.gender,
      wardenName: dto.wardenName || null,
      wardenPhone: dto.wardenPhone || null,
      wardenUserId: dto.wardenUserId || null,
      description: dto.description || null,
      status: dto.status || 'ACTIVE',
      totalRooms: 0,
      totalBeds: 0,
      occupiedBeds: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.hostels.set(id, hostel);
    this.logger.log(`Created hostel ${hostel.id} (${hostel.name}) for tenant ${tenantId}`);
    return hostel;
  }

  async listHostels(tenantId: string, campusId?: string, filter?: HostelFilterDto) {
    let list = Array.from(this.prisma.memoryStore.hostels.values()).filter(
      (h) => h.tenantId === tenantId,
    );

    const targetCampus = filter?.campusId || campusId;
    if (targetCampus) list = list.filter((h) => h.campusId === targetCampus);
    if (filter?.gender && filter.gender !== 'ALL') list = list.filter((h) => h.gender === filter.gender);
    if (filter?.status) list = list.filter((h) => h.status === filter.status);

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          (h.wardenName && h.wardenName.toLowerCase().includes(q)) ||
          (h.code && h.code.toLowerCase().includes(q)),
      );
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getHostelById(tenantId: string, hostelId: string) {
    const hostel = this.prisma.memoryStore.hostels.get(hostelId);
    if (!hostel || hostel.tenantId !== tenantId) {
      throw new NotFoundException(`Hostel with ID ${hostelId} not found`);
    }
    return hostel;
  }

  async updateHostel(tenantId: string, hostelId: string, dto: UpdateHostelDto) {
    const hostel = await this.getHostelById(tenantId, hostelId);
    if (dto.name) hostel.name = dto.name;
    if (dto.code !== undefined) hostel.code = dto.code;
    if (dto.gender) hostel.gender = dto.gender;
    if (dto.wardenName !== undefined) hostel.wardenName = dto.wardenName;
    if (dto.wardenPhone !== undefined) hostel.wardenPhone = dto.wardenPhone;
    if (dto.wardenUserId !== undefined) hostel.wardenUserId = dto.wardenUserId;
    if (dto.description !== undefined) hostel.description = dto.description;
    if (dto.status) hostel.status = dto.status;
    hostel.updatedAt = new Date();

    this.prisma.memoryStore.hostels.set(hostelId, hostel);
    return hostel;
  }

  // --- Rooms ---

  async createRoom(tenantId: string, campusId: string, dto: CreateHostelRoomDto) {
    const hostel = await this.getHostelById(tenantId, dto.hostelId);

    const existingRooms = Array.from(this.prisma.memoryStore.hostelRooms.values()).filter(
      (r) => r.tenantId === tenantId && r.hostelId === dto.hostelId,
    );
    if (existingRooms.some((r) => r.roomNumber.toLowerCase() === dto.roomNumber.toLowerCase())) {
      throw new BadRequestException(
        `Room ${dto.roomNumber} already exists in hostel ${hostel.name}`,
      );
    }

    const id = `hrm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const room = {
      id,
      tenantId,
      campusId: hostel.campusId || campusId,
      hostelId: dto.hostelId,
      roomNumber: dto.roomNumber,
      floor: dto.floor || null,
      roomType: dto.roomType || 'STANDARD',
      capacity: dto.capacity || 4,
      occupied: 0,
      status: 'AVAILABLE',
      notes: dto.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.hostelRooms.set(id, room);
    await this.recalculateHostelCounts(tenantId, dto.hostelId);
    return room;
  }

  async listRooms(tenantId: string, filter?: RoomFilterDto) {
    let list = Array.from(this.prisma.memoryStore.hostelRooms.values()).filter(
      (r) => r.tenantId === tenantId,
    );

    if (filter?.hostelId) list = list.filter((r) => r.hostelId === filter.hostelId);
    if (filter?.campusId) list = list.filter((r) => r.campusId === filter.campusId);
    if (filter?.roomType) list = list.filter((r) => r.roomType === filter.roomType);
    if (filter?.status) list = list.filter((r) => r.status === filter.status);
    if (filter?.floor) list = list.filter((r) => r.floor === filter.floor);

    return list.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
  }

  async getRoomById(tenantId: string, roomId: string) {
    const room = this.prisma.memoryStore.hostelRooms.get(roomId);
    if (!room || room.tenantId !== tenantId) {
      throw new NotFoundException(`Room with ID ${roomId} not found`);
    }
    return room;
  }

  async updateRoom(tenantId: string, roomId: string, dto: UpdateHostelRoomDto) {
    const room = await this.getRoomById(tenantId, roomId);
    if (dto.roomNumber) room.roomNumber = dto.roomNumber;
    if (dto.floor !== undefined) room.floor = dto.floor;
    if (dto.roomType) room.roomType = dto.roomType;
    if (dto.capacity !== undefined) room.capacity = dto.capacity;
    if (dto.status) room.status = dto.status;
    if (dto.notes !== undefined) room.notes = dto.notes;
    room.updatedAt = new Date();

    this.prisma.memoryStore.hostelRooms.set(roomId, room);
    await this.recalculateHostelCounts(tenantId, room.hostelId);
    return room;
  }

  // --- Beds ---

  async createBed(tenantId: string, campusId: string, dto: CreateHostelBedDto) {
    const room = await this.getRoomById(tenantId, dto.roomId);

    const existingBeds = Array.from(this.prisma.memoryStore.hostelBeds.values()).filter(
      (b) => b.tenantId === tenantId && b.roomId === dto.roomId,
    );
    if (existingBeds.some((b) => b.bedNumber.toLowerCase() === dto.bedNumber.toLowerCase())) {
      throw new BadRequestException(
        `Bed ${dto.bedNumber} already exists in room ${room.roomNumber}`,
      );
    }

    const id = `hbd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const bed = {
      id,
      tenantId,
      campusId: room.campusId || campusId,
      hostelId: dto.hostelId,
      roomId: dto.roomId,
      bedNumber: dto.bedNumber,
      status: dto.status || 'VACANT',
      notes: dto.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.hostelBeds.set(id, bed);
    await this.recalculateHostelCounts(tenantId, dto.hostelId);
    return bed;
  }

  async listBeds(tenantId: string, filter?: BedFilterDto) {
    let list = Array.from(this.prisma.memoryStore.hostelBeds.values()).filter(
      (b) => b.tenantId === tenantId,
    );

    if (filter?.hostelId) list = list.filter((b) => b.hostelId === filter.hostelId);
    if (filter?.roomId) list = list.filter((b) => b.roomId === filter.roomId);
    if (filter?.campusId) list = list.filter((b) => b.campusId === filter.campusId);
    if (filter?.status) list = list.filter((b) => b.status === filter.status);

    return list.sort((a, b) => a.bedNumber.localeCompare(b.bedNumber));
  }

  async getBedById(tenantId: string, bedId: string) {
    const bed = this.prisma.memoryStore.hostelBeds.get(bedId);
    if (!bed || bed.tenantId !== tenantId) {
      throw new NotFoundException(`Bed with ID ${bedId} not found`);
    }
    return bed;
  }

  async updateBed(tenantId: string, bedId: string, dto: UpdateHostelBedDto) {
    const bed = await this.getBedById(tenantId, bedId);
    if (dto.bedNumber) bed.bedNumber = dto.bedNumber;
    if (dto.status) bed.status = dto.status;
    if (dto.notes !== undefined) bed.notes = dto.notes;
    bed.updatedAt = new Date();

    this.prisma.memoryStore.hostelBeds.set(bedId, bed);
    await this.recalculateHostelCounts(tenantId, bed.hostelId);
    return bed;
  }

  async recalculateHostelCounts(tenantId: string, hostelId: string) {
    const hostel = this.prisma.memoryStore.hostels.get(hostelId);
    if (!hostel || hostel.tenantId !== tenantId) return;

    const rooms = Array.from(this.prisma.memoryStore.hostelRooms.values()).filter(
      (r) => r.tenantId === tenantId && r.hostelId === hostelId,
    );
    const beds = Array.from(this.prisma.memoryStore.hostelBeds.values()).filter(
      (b) => b.tenantId === tenantId && b.hostelId === hostelId,
    );

    hostel.totalRooms = rooms.length;
    hostel.totalBeds = beds.length;
    hostel.occupiedBeds = beds.filter((b) => b.status === 'OCCUPIED').length;
    hostel.updatedAt = new Date();

    this.prisma.memoryStore.hostels.set(hostelId, hostel);
  }
}
