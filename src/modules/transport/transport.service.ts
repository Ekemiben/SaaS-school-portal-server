import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTransportRouteDto, UpdateTransportRouteDto, AllocationStatus } from './dto/transport.dto.js';
import { randomUUID } from 'crypto';

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listRoutes(tenantId: string, campusId?: string) {
    if (this.prisma.isDbConnected) {
      const routes = await this.prisma.transportRoute.findMany({
        where: {
          tenantId,
          ...(campusId ? { campusId } : {}),
        },
        include: {
          routeStops: { orderBy: { stopOrder: 'asc' } },
          _count: {
            select: {
              studentAllocations: {
                where: { status: AllocationStatus.ACTIVE },
              },
            },
          },
        },
        orderBy: { routeName: 'asc' },
      });

      return routes.map((r) => ({
        ...r,
        enrolled: r._count?.studentAllocations ?? 0,
      }));
    }

    // Memory Store Fallback
    const routes = Array.from(this.prisma.memoryStore.transportRoutes.values()).filter(
      (r) => r.tenantId === tenantId && (!campusId || r.campusId === campusId),
    );

    const allocations = Array.from(this.prisma.memoryStore.studentTransportAllocations.values());

    return routes.map((r) => this.enrichRoute(r, allocations));
  }

  private enrichRoute(r: any, allocations: any[] = []) {
    const enrolled =
      r.enrolled ??
      allocations.filter(
        (a) => a.tenantId === r.tenantId && a.routeId === r.id && a.status === AllocationStatus.ACTIVE,
      ).length ??
      (r.passengers ? r.passengers.length : 0);

    return {
      ...r,
      name: r.name || r.routeName || 'Bus Route',
      routeName: r.routeName || r.name || 'Bus Route',
      vehicle: r.vehicle || (r.vehicleNumber ? `Bus (${r.vehicleNumber})` : 'Toyota Coaster (Bus 01)'),
      plateNumber: r.plateNumber || r.vehicleNumber || 'KJA-892-XA',
      driver: r.driver || r.driverName || 'Designated Driver',
      driverPhone: r.driverPhone || '+234 800 000 0000',
      capacity: Number(r.capacity || 35),
      enrolled,
      feePerTerm: Number(r.feePerTerm || r.fee || 45000),
      status: r.status || 'Active',
      stops: r.stops || (r.routeStops ? r.routeStops.map((s: any) => s.stopName) : ['Campus Arrival (7:30 AM)']),
      passengers: r.passengers || [],
    };
  }

  async getRouteById(tenantId: string, routeId: string) {
    if (this.prisma.isDbConnected) {
      const route = await this.prisma.transportRoute.findFirst({
        where: { id: routeId, tenantId },
        include: {
          routeStops: { orderBy: { stopOrder: 'asc' } },
          _count: {
            select: {
              studentAllocations: {
                where: { status: AllocationStatus.ACTIVE },
              },
            },
          },
        },
      });
      if (!route) throw new NotFoundException(`Transport route "${routeId}" not found.`);
      return {
        ...route,
        enrolled: route._count?.studentAllocations ?? 0,
      };
    }

    const route = Array.from(this.prisma.memoryStore.transportRoutes.values()).find(
      (r) => r.id === routeId && r.tenantId === tenantId,
    );
    if (!route) throw new NotFoundException('Transport route not found.');

    const allocations = Array.from(this.prisma.memoryStore.studentTransportAllocations.values());
    return this.enrichRoute(route, allocations);
  }

  async createRoute(tenantId: string, data: CreateTransportRouteDto) {
    if (this.prisma.isDbConnected) {
      const campus = await this.prisma.campus.findFirst({
        where: { id: data.campusId, tenantId },
      });
      if (!campus) throw new NotFoundException(`Campus "${data.campusId}" not found.`);

      const stopsData = (data.stops || []).map((stop, index) => ({
        stopName: stop.stopName,
        stopOrder: stop.stopOrder ?? index + 1,
        pickupTime: stop.pickupTime,
        dropoffTime: stop.dropoffTime,
        latitude: stop.latitude,
        longitude: stop.longitude,
      }));

      return this.prisma.transportRoute.create({
        data: {
          tenantId,
          campusId: data.campusId,
          routeName: data.routeName,
          vehicleNumber: data.vehicleNumber,
          driverName: data.driverName,
          driverPhone: data.driverPhone,
          capacity: data.capacity ?? 30,
          fee: data.fee ?? 0,
          stops: data.stops ? (data.stops as any) : undefined,
          routeStops: {
            create: stopsData,
          },
        },
        include: {
          routeStops: { orderBy: { stopOrder: 'asc' } },
        },
      });
    }

    const id = `RT-0${this.prisma.memoryStore.transportRoutes.size + 1}`;
    const route = {
      id,
      tenantId,
      campusId: data.campusId || 'campus_main_01',
      name: (data as any).name || data.routeName || 'New Route',
      routeName: (data as any).name || data.routeName || 'New Route',
      vehicle: (data as any).vehicle || 'Toyota HiAce',
      plateNumber: (data as any).plateNumber || data.vehicleNumber || 'APP-101-XY',
      vehicleNumber: (data as any).plateNumber || data.vehicleNumber || 'APP-101-XY',
      driver: (data as any).driver || data.driverName || 'Designated Driver',
      driverName: (data as any).driver || data.driverName || 'Designated Driver',
      driverPhone: (data as any).driverPhone || data.driverPhone || '+234 800 000 0000',
      capacity: Number((data as any).capacity || data.capacity || 30),
      enrolled: 0,
      feePerTerm: Number((data as any).feePerTerm || data.fee || 40000),
      fee: Number((data as any).feePerTerm || data.fee || 40000),
      status: 'Active',
      stops: (data as any).stops || ['Campus Arrival (7:30 AM)'],
      passengers: [],
      routeStops: ((data as any).stops || []).map((s: any, idx: number) => ({
        id: `stop_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
        routeId: id,
        stopName: typeof s === 'string' ? s : s.stopName,
        stopOrder: idx + 1,
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.transportRoutes.set(id, route);
    return this.enrichRoute(route);
  }

  async updateRoute(tenantId: string, routeId: string, data: UpdateTransportRouteDto) {
    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.transportRoute.findFirst({
        where: { id: routeId, tenantId },
      });
      if (!existing) throw new NotFoundException(`Transport route "${routeId}" not found.`);

      return this.prisma.transportRoute.update({
        where: { id: routeId },
        data: {
          ...(data.routeName && { routeName: data.routeName }),
          ...(data.vehicleNumber && { vehicleNumber: data.vehicleNumber }),
          ...(data.driverName && { driverName: data.driverName }),
          ...(data.driverPhone && { driverPhone: data.driverPhone }),
          ...(data.capacity !== undefined && { capacity: data.capacity }),
          ...(data.fee !== undefined && { fee: data.fee }),
          ...(data.status && { status: data.status }),
          ...(data.stops && { stops: data.stops as any }),
        },
        include: { routeStops: true },
      });
    }

    const route = this.prisma.memoryStore.transportRoutes.get(routeId);
    if (!route || route.tenantId !== tenantId) throw new NotFoundException('Transport route not found.');

    Object.assign(route, {
      ...(data.routeName && { routeName: data.routeName }),
      ...(data.vehicleNumber && { vehicleNumber: data.vehicleNumber }),
      ...(data.driverName && { driverName: data.driverName }),
      ...(data.driverPhone && { driverPhone: data.driverPhone }),
      ...(data.capacity !== undefined && { capacity: data.capacity }),
      ...(data.fee !== undefined && { fee: data.fee }),
      ...(data.status && { status: data.status }),
      ...(data.stops && { stops: data.stops }),
      updatedAt: new Date(),
    });

    this.prisma.memoryStore.transportRoutes.set(routeId, route);
    return route;
  }

  async deleteRoute(tenantId: string, routeId: string) {
    if (this.prisma.isDbConnected) {
      const activeCount = await this.prisma.studentTransportAllocation.count({
        where: { tenantId, routeId, status: AllocationStatus.ACTIVE },
      });
      if (activeCount > 0) {
        throw new BadRequestException('Cannot delete a transport route with active student allocations.');
      }
      await this.prisma.transportRoute.deleteMany({
        where: { id: routeId, tenantId },
      });
      return { success: true, message: `Route "${routeId}" deleted.` };
    }

    const route = this.prisma.memoryStore.transportRoutes.get(routeId);
    if (!route || route.tenantId !== tenantId) throw new NotFoundException('Transport route not found.');
    this.prisma.memoryStore.transportRoutes.delete(routeId);
    return { success: true, message: 'Route deleted.' };
  }
}

