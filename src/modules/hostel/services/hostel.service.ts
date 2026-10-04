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
import { randomUUID } from 'crypto';

@Injectable()
export class HostelService {
  private readonly logger = new Logger(HostelService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createHostel(tenantId: string, campusId: string, dto: CreateHostelDto) {
    let targetCampusId = dto.campusId || campusId;
    const campusExists = await this.prisma.campus.findFirst({
      where: { id: targetCampusId, tenantId },
    });
    if (!campusExists) {
      const mainCampus = (await this.prisma.campus.findFirst({
        where: { tenantId, isMain: true },
      })) || (await this.prisma.campus.findFirst({
        where: { tenantId },
      }));
      if (mainCampus) targetCampusId = mainCampus.id;
    }

    const id = `hst_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const created = await this.prisma.hostel.create({
      data: {
        id,
        tenantId,
        campusId: targetCampusId,
        name: dto.name || (dto as any).hall || 'Hostel Hall',
        code: dto.code || `HST-${Math.floor(100 + Math.random() * 900)}`,
        gender: dto.gender || 'Boys',
        wardenName: dto.wardenName || (dto as any).warden || null,
        wardenPhone: dto.wardenPhone || null,
        wardenUserId: dto.wardenUserId || null,
        description: dto.description || null,
        status: dto.status || 'Available',
        totalRooms: Number((dto as any).rooms || (dto as any).totalRooms || 0),
        totalBeds: Number((dto as any).totalBeds || (dto as any).beds || 0),
        occupiedBeds: 0,
      },
    });

    this.logger.log(`Created hostel ${created.id} (${created.name}) for tenant ${tenantId}`);
    return this.enrichHostel(created);
  }

  private enrichHostel(h: any) {
    const totalBeds = h.totalBeds || 0;
    const occupiedBeds = h.occupiedBeds || 0;
    return {
      ...h,
      hall: h.name || h.hall || 'Hostel Hall',
      warden: h.wardenName || h.warden || 'Hostel Master',
      wardenPhone: h.wardenPhone || '+234 800 000 0000',
      rooms: h.totalRooms || h.rooms || 0,
      totalBeds,
      occupiedBeds,
      status: occupiedBeds >= totalBeds && totalBeds > 0 ? 'Occupied' : (h.status || 'Available'),
      residents: h.residents || [],
    };
  }

  async listHostels(tenantId: string, campusId?: string, filter?: HostelFilterDto) {
    const where: any = { tenantId };
    const targetCampus = filter?.campusId || campusId;
    if (targetCampus) where.campusId = targetCampus;
    if (filter?.gender && filter.gender !== 'ALL') where.gender = filter.gender;
    if (filter?.status) where.status = filter.status;
    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { wardenName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.hostel.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return rows.map((h) => this.enrichHostel(h));
  }

  async getHostelById(tenantId: string, hostelId: string) {
    const hostel = await this.prisma.hostel.findFirst({
      where: { id: hostelId, tenantId },
      include: {
        rooms: {
          include: { beds: true },
        },
      },
    });
    if (!hostel) {
      throw new NotFoundException(`Hostel with ID ${hostelId} not found`);
    }
    return this.enrichHostel(hostel);
  }

  async updateHostel(tenantId: string, hostelId: string, dto: UpdateHostelDto) {
    await this.getHostelById(tenantId, hostelId);
    const updated = await this.prisma.hostel.update({
      where: { id: hostelId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.gender ? { gender: dto.gender } : {}),
        ...(dto.wardenName !== undefined ? { wardenName: dto.wardenName } : {}),
        ...(dto.wardenPhone !== undefined ? { wardenPhone: dto.wardenPhone } : {}),
        ...(dto.wardenUserId !== undefined ? { wardenUserId: dto.wardenUserId } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    return this.enrichHostel(updated);
  }

  // --- Rooms ---

  async createRoom(tenantId: string, campusId: string, dto: CreateHostelRoomDto) {
    const hostel = await this.getHostelById(tenantId, dto.hostelId);

    const existing = await this.prisma.hostelRoom.findFirst({
      where: {
        tenantId,
        hostelId: dto.hostelId,
        roomNumber: dto.roomNumber,
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Room ${dto.roomNumber} already exists in hostel ${hostel.name}`,
      );
    }

    const id = `hrm_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const room = await this.prisma.hostelRoom.create({
      data: {
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
      },
    });

    await this.recalculateHostelCounts(tenantId, dto.hostelId);
    return room;
  }

  async listRooms(tenantId: string, filter?: RoomFilterDto) {
    const where: any = { tenantId };
    if (filter?.hostelId) where.hostelId = filter.hostelId;
    if (filter?.campusId) where.campusId = filter.campusId;
    if (filter?.roomType) where.roomType = filter.roomType;
    if (filter?.status) where.status = filter.status;
    if (filter?.floor) where.floor = filter.floor;

    return this.prisma.hostelRoom.findMany({
      where,
      orderBy: { roomNumber: 'asc' },
      include: {
        beds: true,
      },
    });
  }

  async getRoomById(tenantId: string, roomId: string) {
    const room = await this.prisma.hostelRoom.findFirst({
      where: { id: roomId, tenantId },
      include: { beds: true },
    });
    if (!room) {
      throw new NotFoundException(`Room with ID ${roomId} not found`);
    }
    return room;
  }

  async updateRoom(tenantId: string, roomId: string, dto: UpdateHostelRoomDto) {
    const room = await this.getRoomById(tenantId, roomId);
    const updated = await this.prisma.hostelRoom.update({
      where: { id: roomId },
      data: {
        ...(dto.roomNumber ? { roomNumber: dto.roomNumber } : {}),
        ...(dto.floor !== undefined ? { floor: dto.floor } : {}),
        ...(dto.roomType ? { roomType: dto.roomType } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.recalculateHostelCounts(tenantId, room.hostelId);
    return updated;
  }

  // --- Beds ---

  async createBed(tenantId: string, campusId: string, dto: CreateHostelBedDto) {
    const room = await this.getRoomById(tenantId, dto.roomId);

    const existing = await this.prisma.hostelBed.findFirst({
      where: {
        tenantId,
        roomId: dto.roomId,
        bedNumber: dto.bedNumber,
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Bed ${dto.bedNumber} already exists in room ${room.roomNumber}`,
      );
    }

    const id = `hbd_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const bed = await this.prisma.hostelBed.create({
      data: {
        id,
        tenantId,
        campusId: room.campusId || campusId,
        hostelId: dto.hostelId,
        roomId: dto.roomId,
        bedNumber: dto.bedNumber,
        status: dto.status || 'VACANT',
        notes: dto.notes || null,
      },
    });

    await this.recalculateHostelCounts(tenantId, dto.hostelId);
    return bed;
  }

  async listBeds(tenantId: string, filter?: BedFilterDto) {
    const where: any = { tenantId };
    if (filter?.hostelId) where.hostelId = filter.hostelId;
    if (filter?.roomId) where.roomId = filter.roomId;
    if (filter?.campusId) where.campusId = filter.campusId;
    if (filter?.status) where.status = filter.status;

    return this.prisma.hostelBed.findMany({
      where,
      orderBy: { bedNumber: 'asc' },
    });
  }

  async getBedById(tenantId: string, bedId: string) {
    const bed = await this.prisma.hostelBed.findFirst({
      where: { id: bedId, tenantId },
    });
    if (!bed) {
      throw new NotFoundException(`Bed with ID ${bedId} not found`);
    }
    return bed;
  }

  async updateBed(tenantId: string, bedId: string, dto: UpdateHostelBedDto) {
    const bed = await this.getBedById(tenantId, bedId);
    const updated = await this.prisma.hostelBed.update({
      where: { id: bedId },
      data: {
        ...(dto.bedNumber ? { bedNumber: dto.bedNumber } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.recalculateHostelCounts(tenantId, bed.hostelId);
    return updated;
  }

  async recalculateHostelCounts(tenantId: string, hostelId: string) {
    const [roomsCount, bedsCount, occupiedCount] = await Promise.all([
      this.prisma.hostelRoom.count({ where: { tenantId, hostelId } }),
      this.prisma.hostelBed.count({ where: { tenantId, hostelId } }),
      this.prisma.hostelBed.count({ where: { tenantId, hostelId, status: 'OCCUPIED' } }),
    ]);

    await this.prisma.hostel.update({
      where: { id: hostelId },
      data: {
        totalRooms: roomsCount,
        totalBeds: bedsCount,
        occupiedBeds: occupiedCount,
      },
    }).catch(() => {});
  }
}
