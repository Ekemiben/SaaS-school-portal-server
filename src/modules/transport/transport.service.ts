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

    return routes.map((r) => {
      const enrolled = allocations.filter(
        (a) => a.tenantId === tenantId && a.routeId === r.id && a.status === AllocationStatus.ACTIVE,
      ).length;
      return {
        ...r,
        enrolled,
      };
    });
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
    const enrolled = allocations.filter(
      (a) => a.tenantId === tenantId && a.routeId === route.id && a.status === AllocationStatus.ACTIVE,
    ).length;

    return { ...route, enrolled };
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

    const id = `route_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const route = {
      id,
      tenantId,
      campusId: data.campusId,
      routeName: data.routeName,
      vehicleNumber: data.vehicleNumber,
      driverName: data.driverName,
      driverPhone: data.driverPhone,
      capacity: data.capacity ?? 30,
      fee: Number(data.fee || 0),
      stops: data.stops || [],
      routeStops: (data.stops || []).map((s, idx) => ({
        id: `stop_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
        routeId: id,
        stopName: s.stopName,
        stopOrder: s.stopOrder ?? idx + 1,
        pickupTime: s.pickupTime,
        dropoffTime: s.dropoffTime,
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.transportRoutes.set(id, route);
    return route;
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

