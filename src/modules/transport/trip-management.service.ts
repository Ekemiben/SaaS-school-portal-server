import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { StartTripDto, UpdateTripStatusDto, RecordBoardingDto, TripStatus, BoardingStatus, TrackingMode } from './dto/fleet-and-trip.dto.js';
import { TrackingProviderFactory } from './tracking/tracking.providers.js';
import { randomUUID } from 'crypto';

@Injectable()
export class TripManagementService {
  private readonly logger = new Logger(TripManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trackingFactory: TrackingProviderFactory,
  ) {}

  async startTrip(tenantId: string, dto: StartTripDto) {
    const route = await this.prisma.transportRoute.findFirst({ where: { id: dto.routeId, tenantId } });
    if (!route) throw new NotFoundException(`Transport route "${dto.routeId}" not found in this school organization.`);

    let vehicleNumber = dto.vehicleNumber || route.vehicleNumber;
    let driverName = dto.driverName || route.driverName;
    let driverPhone = dto.driverPhone || route.driverPhone;
    let trackingMode = dto.trackingMode || (route.trackingMode as TrackingMode) || TrackingMode.NONE;

    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, tenantId } });
      if (vehicle) {
        vehicleNumber = vehicle.vehicleNumber;
        driverName = dto.driverName || vehicle.driverName || driverName;
        driverPhone = dto.driverPhone || vehicle.driverPhone || driverPhone;
        if (!dto.trackingMode) trackingMode = vehicle.trackingMode as TrackingMode;
      }
    }

    const tripId = `trip_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    await this.prisma.transportTrip.create({
      data: {
        id: tripId,
        tenantId,
        campusId: dto.campusId || route.campusId,
        routeId: dto.routeId,
        vehicleId: dto.vehicleId,
        vehicleNumber,
        driverName,
        driverPhone,
        tripType: dto.tripType || 'PICKUP',
        trackingMode,
        status: TripStatus.IN_PROGRESS,
        startedAt: new Date(),
        notes: dto.notes,
      },
    });

    const activeAllocations = await this.prisma.studentTransportAllocation.findMany({
      where: { tenantId, routeId: dto.routeId, status: 'ACTIVE' },
    });

    if (activeAllocations.length > 0) {
      await this.prisma.tripBoardingRecord.createMany({
        data: activeAllocations.map((a) => ({
          tenantId,
          tripId,
          studentId: a.studentId,
          stopId: a.pickupStopId,
          stopName: a.pickupStopName || 'Assigned Stop',
          status: BoardingStatus.WAITING,
        })),
      });
    }

    return this.getTripDetails(tenantId, tripId);
  }

  async updateTripStatus(tenantId: string, tripId: string, dto: UpdateTripStatusDto) {
    const isEnding = dto.status === TripStatus.COMPLETED || dto.status === TripStatus.CANCELLED;
    const trip = await this.prisma.transportTrip.findFirst({ where: { id: tripId, tenantId } });
    if (!trip) throw new NotFoundException(`Trip "${tripId}" not found.`);

    return this.prisma.transportTrip.update({
      where: { id: tripId },
      data: { status: dto.status, notes: dto.notes || trip.notes, ...(isEnding ? { endedAt: new Date() } : {}) },
    });
  }

  async recordStudentBoarding(tenantId: string, tripId: string, dto: RecordBoardingDto) {
    const isBoarded = dto.status === BoardingStatus.BOARDED;
    const isDroppedOff = dto.status === BoardingStatus.DROPPED_OFF;

    const trip = await this.prisma.transportTrip.findFirst({ where: { id: tripId, tenantId } });
    if (!trip) throw new NotFoundException(`Trip "${tripId}" not found for this school organization.`);

    const existing = await this.prisma.tripBoardingRecord.findFirst({ where: { tripId, studentId: dto.studentId, tenantId } });
    if (!existing) {
      return this.prisma.tripBoardingRecord.create({
        data: {
          tenantId,
          tripId,
          studentId: dto.studentId,
          stopId: dto.stopId,
          stopName: dto.stopName,
          status: dto.status,
          boardingMethod: dto.boardingMethod || 'MANUAL',
          boardingTime: isBoarded ? new Date() : undefined,
          dropoffTime: isDroppedOff ? new Date() : undefined,
          latitude: dto.latitude,
          longitude: dto.longitude,
          notes: dto.notes,
        },
      });
    }

    return this.prisma.tripBoardingRecord.update({
      where: { id: existing.id },
      data: {
        status: dto.status,
        stopName: dto.stopName || existing.stopName,
        boardingMethod: dto.boardingMethod || existing.boardingMethod,
        ...(isBoarded ? { boardingTime: new Date() } : {}),
        ...(isDroppedOff ? { dropoffTime: new Date() } : {}),
        latitude: dto.latitude ?? existing.latitude,
        longitude: dto.longitude ?? existing.longitude,
        notes: dto.notes || existing.notes,
      },
    });
  }

  async getTripDetails(tenantId: string, tripId: string) {
    const trip = await this.prisma.transportTrip.findFirst({
      where: { id: tripId, tenantId },
      include: {
        route: { include: { routeStops: { orderBy: { stopOrder: 'asc' } } } },
        vehicle: true,
        campus: { select: { id: true, name: true, code: true } },
        boardingRecords: {
          include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, phone: true } } },
        },
      },
    });
    if (!trip) throw new NotFoundException(`Trip "${tripId}" not found.`);
    const boardingRecords = trip.boardingRecords;

    const provider = this.trackingFactory.getProvider(trip.trackingMode);
    const liveStatus = await provider.getLiveStatus(tenantId, { tripId: trip.id, vehicleNumber: trip.vehicleNumber || undefined });

    return {
      ...trip,
      liveTracking: liveStatus,
      passengerSummary: {
        total: boardingRecords.length,
        boarded: boardingRecords.filter((b) => b.status === BoardingStatus.BOARDED).length,
        droppedOff: boardingRecords.filter((b) => b.status === BoardingStatus.DROPPED_OFF).length,
        waiting: boardingRecords.filter((b) => b.status === BoardingStatus.WAITING).length,
        absent: boardingRecords.filter((b) => b.status === BoardingStatus.ABSENT).length,
      },
    };
  }

  async listTrips(tenantId: string, query: { routeId?: string; vehicleId?: string; status?: string; campusId?: string }) {
    return this.prisma.transportTrip.findMany({
      where: {
        tenantId,
        ...(query.routeId && { routeId: query.routeId }),
        ...(query.vehicleId && { vehicleId: query.vehicleId }),
        ...(query.status && { status: query.status }),
        ...(query.campusId && { campusId: query.campusId }),
      },
      include: {
        route: { select: { id: true, routeName: true } },
        vehicle: { select: { id: true, vehicleNumber: true, model: true } },
        _count: { select: { boardingRecords: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
