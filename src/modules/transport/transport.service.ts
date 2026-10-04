import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTransportRouteDto, UpdateTransportRouteDto, AllocationStatus } from './dto/transport.dto.js';

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listRoutes(tenantId: string, campusId?: string) {
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

    return routes.map((r) => this.enrichRoute(r));
  }

  private enrichRoute(r: any) {
    const enrolled = r._count?.studentAllocations ?? (r.passengers ? r.passengers.length : 0);

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
    return this.enrichRoute(route);
  }

  async createRoute(tenantId: string, data: CreateTransportRouteDto) {
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

    const created = await this.prisma.transportRoute.create({
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

    return this.enrichRoute(created);
  }

  async updateRoute(tenantId: string, routeId: string, data: UpdateTransportRouteDto) {
    const existing = await this.prisma.transportRoute.findFirst({
      where: { id: routeId, tenantId },
    });
    if (!existing) throw new NotFoundException(`Transport route "${routeId}" not found.`);

    const updated = await this.prisma.transportRoute.update({
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

    return this.enrichRoute(updated);
  }

  async deleteRoute(tenantId: string, routeId: string) {
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
}
