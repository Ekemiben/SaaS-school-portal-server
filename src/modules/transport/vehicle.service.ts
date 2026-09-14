import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateVehicleDto, UpdateVehicleDto, TrackingMode, VehicleOwnershipType } from './dto/fleet-and-trip.dto.js';
import { randomUUID } from 'crypto';

@Injectable()
export class VehicleService {
  private readonly logger = new Logger(VehicleService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listVehicles(tenantId: string, campusId?: string) {
    if (this.prisma.isDbConnected) {
      return this.prisma.vehicle.findMany({
        where: {
          tenantId,
          ...(campusId ? { campusId } : {}),
        },
        orderBy: { vehicleNumber: 'asc' },
      });
    }

    return Array.from(this.prisma.memoryStore.vehicles.values()).filter(
      (v) => v.tenantId === tenantId && (!campusId || v.campusId === campusId),
    );
  }

  async getVehicleById(tenantId: string, vehicleId: string) {
    if (this.prisma.isDbConnected) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, tenantId },
      });
      if (!vehicle) throw new NotFoundException(`Vehicle "${vehicleId}" not found.`);
      return vehicle;
    }

    const vehicle = Array.from(this.prisma.memoryStore.vehicles.values()).find(
      (v) => (v.id === vehicleId || v.vehicleNumber === vehicleId) && v.tenantId === tenantId,
    );
    if (!vehicle) throw new NotFoundException(`Vehicle "${vehicleId}" not found.`);
    return vehicle;
  }

  async createVehicle(tenantId: string, dto: CreateVehicleDto) {
    const cleanNumber = dto.vehicleNumber.trim().toUpperCase();

    if (this.prisma.isDbConnected) {
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

    const existing = Array.from(this.prisma.memoryStore.vehicles.values()).find(
      (v) => v.tenantId === tenantId && v.vehicleNumber === cleanNumber,
    );
    if (existing) {
      throw new ConflictException(`Vehicle "${cleanNumber}" is already registered in this school.`);
    }

    const id = `veh_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const vehicle = {
      id,
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
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.vehicles.set(id, vehicle);
    return vehicle;
  }

  async updateVehicle(tenantId: string, vehicleId: string, dto: UpdateVehicleDto) {
    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, tenantId },
      });
      if (!existing) throw new NotFoundException(`Vehicle "${vehicleId}" not found.`);

      return this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          ...(dto.model && { model: dto.model }),
          ...(dto.capacity !== undefined && { capacity: dto.capacity }),
          ...(dto.ownershipType && { ownershipType: dto.ownershipType }),
          ...(dto.providerName !== undefined && { providerName: dto.providerName }),
          ...(dto.driverName !== undefined && { driverName: dto.driverName }),
          ...(dto.driverPhone !== undefined && { driverPhone: dto.driverPhone }),
          ...(dto.trackingEnabled !== undefined && { trackingEnabled: dto.trackingEnabled }),
          ...(dto.trackingMode && { trackingMode: dto.trackingMode }),
          ...(dto.deviceId !== undefined && { deviceId: dto.deviceId }),
          ...(dto.status && { status: dto.status }),
        },
      });
    }

    const vehicle = this.prisma.memoryStore.vehicles.get(vehicleId);
    if (!vehicle || vehicle.tenantId !== tenantId) throw new NotFoundException('Vehicle not found.');

    Object.assign(vehicle, {
      ...(dto.model && { model: dto.model }),
      ...(dto.capacity !== undefined && { capacity: dto.capacity }),
      ...(dto.ownershipType && { ownershipType: dto.ownershipType }),
      ...(dto.providerName !== undefined && { providerName: dto.providerName }),
      ...(dto.driverName !== undefined && { driverName: dto.driverName }),
      ...(dto.driverPhone !== undefined && { driverPhone: dto.driverPhone }),
      ...(dto.trackingEnabled !== undefined && { trackingEnabled: dto.trackingEnabled }),
      ...(dto.trackingMode && { trackingMode: dto.trackingMode }),
      ...(dto.deviceId !== undefined && { deviceId: dto.deviceId }),
      ...(dto.status && { status: dto.status }),
      updatedAt: new Date(),
    });

    this.prisma.memoryStore.vehicles.set(vehicleId, vehicle);
    return vehicle;
  }

  async deleteVehicle(tenantId: string, vehicleId: string) {
    if (this.prisma.isDbConnected) {
      await this.prisma.vehicle.deleteMany({
        where: { id: vehicleId, tenantId },
      });
      return { success: true, message: `Vehicle "${vehicleId}" deleted.` };
    }

    const vehicle = this.prisma.memoryStore.vehicles.get(vehicleId);
    if (!vehicle || vehicle.tenantId !== tenantId) throw new NotFoundException('Vehicle not found.');
    this.prisma.memoryStore.vehicles.delete(vehicleId);
    return { success: true, message: 'Vehicle deleted.' };
  }
}
