import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateVehicleDto, UpdateVehicleDto, TrackingMode, VehicleOwnershipType } from './dto/fleet-and-trip.dto.js';

@Injectable()
export class VehicleService {
  private readonly logger = new Logger(VehicleService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listVehicles(tenantId: string, campusId?: string) {
    return this.prisma.vehicle.findMany({
      where: {
        tenantId,
        ...(campusId ? { campusId } : {}),
      },
      orderBy: { vehicleNumber: 'asc' },
    });
  }

  async getVehicleById(tenantId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        tenantId,
        OR: [{ id: vehicleId }, { vehicleNumber: vehicleId }],
      },
    });
    if (!vehicle) throw new NotFoundException(`Vehicle "${vehicleId}" not found.`);
    return vehicle;
  }

  async createVehicle(tenantId: string, dto: CreateVehicleDto) {
    const cleanNumber = dto.vehicleNumber.trim().toUpperCase();

    const existing = await this.prisma.vehicle.findUnique({
      where: { tenantId_vehicleNumber: { tenantId, vehicleNumber: cleanNumber } },
    });
    if (existing) {
      throw new ConflictException(`Vehicle "${cleanNumber}" is already registered in this school.`);
    }

    return this.prisma.vehicle.create({
      data: {
        tenantId,
        campusId: dto.campusId,
        vehicleNumber: cleanNumber,
        model: dto.model,
        capacity: dto.capacity ?? 30,
        ownershipType: dto.ownershipType || VehicleOwnershipType.SCHOOL_OWNED,
        providerName: dto.providerName,
        driverName: dto.driverName,
        driverPhone: dto.driverPhone,
        trackingEnabled: dto.trackingEnabled ?? (dto.trackingMode && dto.trackingMode !== TrackingMode.NONE ? true : false),
        trackingMode: dto.trackingMode || TrackingMode.NONE,
        deviceId: dto.deviceId,
        deviceSecret: dto.deviceSecret,
      },
    });
  }

  async updateVehicle(tenantId: string, vehicleId: string, dto: UpdateVehicleDto) {
    const existing = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId },
    });
    if (!existing) throw new NotFoundException(`Vehicle "${vehicleId}" not found.`);

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.ownershipType !== undefined && { ownershipType: dto.ownershipType }),
        ...(dto.providerName !== undefined && { providerName: dto.providerName }),
        ...(dto.driverName !== undefined && { driverName: dto.driverName }),
        ...(dto.driverPhone !== undefined && { driverPhone: dto.driverPhone }),
        ...(dto.trackingEnabled !== undefined && { trackingEnabled: dto.trackingEnabled }),
        ...(dto.trackingMode !== undefined && { trackingMode: dto.trackingMode }),
        ...(dto.deviceId !== undefined && { deviceId: dto.deviceId }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
  }

  async deleteVehicle(tenantId: string, vehicleId: string) {
    const existing = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId },
    });
    if (!existing) throw new NotFoundException('Vehicle not found.');

    await this.prisma.vehicle.deleteMany({
      where: { id: vehicleId, tenantId },
    });
    return { success: true, message: `Vehicle "${vehicleId}" deleted.` };
  }
}
