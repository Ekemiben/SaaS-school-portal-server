import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class TransportService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoutes(tenantId: string, campusId?: string) {
    return Array.from(this.prisma.memoryStore.transportRoutes.values()).filter(
      (r) => r.tenantId === tenantId && (!campusId || r.campusId === campusId),
    );
  }

  async createRoute(tenantId: string, data: any) {
    const id = `route_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const route = {
      id,
      tenantId,
      campusId: data.campusId,
      routeName: data.routeName,
      vehicleNumber: data.vehicleNumber,
      driverName: data.driverName,
      driverPhone: data.driverPhone,
      fee: Number(data.fee || 0),
      stops: data.stops || [],
      createdAt: new Date(),
    };
    this.prisma.memoryStore.transportRoutes.set(id, route);
    return route;
  }
}
