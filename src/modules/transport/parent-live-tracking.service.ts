import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { TransportTrackingService } from './transport-tracking.service.js';
import { ParentLiveTrackingStatus, QueryParentLiveTrackingDto } from './dto/parent-live-tracking.dto.js';
import { TripStatus, BoardingStatus } from './dto/fleet-and-trip.dto.js';

@Injectable()
export class ParentLiveTrackingService {
  private readonly logger = new Logger(ParentLiveTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trackingService: TransportTrackingService,
  ) {}

  async getStudentLiveTransport(
    tenantId: string,
    studentId: string,
    options?: { parentUserId?: string; query?: QueryParentLiveTrackingDto },
  ) {
    // 1. Fetch Student & Validate Tenant Isolation
    let student: any = null;
    let allocation: any = null;
    let activeTrip: any = null;
    let boardingRecord: any = null;

    if (this.prisma.isDbConnected) {
      student = await this.prisma.student.findFirst({
        where: { id: studentId, tenantId },
        include: {
          campus: { select: { id: true, name: true } },
          parents: { include: { parent: true } },
        },
      });
      if (!student) throw new NotFoundException(`Student "${studentId}" not found in this school organization.`);

      // If parent user specified, verify parent-student link
      if (options?.parentUserId) {
        const isLinked = student.parents.some(
          (p: any) => p.parentId === options.parentUserId || p.parent?.id === options.parentUserId || p.parent?.userId === options.parentUserId,
        );
        if (!isLinked) {
          throw new ForbiddenException('You are not authorized to view transport details for this student.');
        }
      }

      // Fetch active transport allocation
      allocation = await this.prisma.studentTransportAllocation.findFirst({
        where: {
          tenantId,
          studentId,
          status: 'ACTIVE',
          ...(options?.query?.academicYearId && { academicYearId: options.query.academicYearId }),
        },
        include: {
          route: {
            include: {
              routeStops: { orderBy: { stopOrder: 'asc' } },
            },
          },
        },
      });

      if (allocation?.routeId) {
        activeTrip = await this.prisma.transportTrip.findFirst({
          where: {
            tenantId,
            routeId: allocation.routeId,
            status: TripStatus.IN_PROGRESS,
          },
          include: {
            vehicle: { select: { id: true, vehicleNumber: true, model: true } },
            boardingRecords: { where: { studentId } },
          },
          orderBy: { startedAt: 'desc' },
        });

        if (activeTrip && activeTrip.boardingRecords?.length > 0) {
          boardingRecord = activeTrip.boardingRecords[0];
        }
      }
    } else {
      student = Array.from(this.prisma.memoryStore.students.values()).find(
        (s) => s.id === studentId && s.tenantId === tenantId,
      );
      if (!student) throw new NotFoundException('Student not found in this school organization.');

      allocation = Array.from(this.prisma.memoryStore.studentTransportAllocations.values()).find(
        (a) => a.studentId === studentId && a.tenantId === tenantId && a.status === 'ACTIVE',
      );

      if (allocation?.routeId) {
        activeTrip = Array.from(this.prisma.memoryStore.transportTrips.values()).find(
          (t) => t.routeId === allocation.routeId && t.tenantId === tenantId && t.status === TripStatus.IN_PROGRESS,
        );

        if (activeTrip) {
          boardingRecord = Array.from(this.prisma.memoryStore.tripBoardingRecords.values()).find(
            (r) => r.tripId === activeTrip.id && r.studentId === studentId && r.tenantId === tenantId,
          );
        }
      }
    }

    const studentSummary = {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      campus: student.campus?.name,
    };

    // Scenario: Student not enrolled in school transport
    if (!allocation) {
      return {
        student: studentSummary,
        status: ParentLiveTrackingStatus.NO_ALLOCATION,
        liveTrackingEnabled: false,
        message: 'Student is not currently registered for transport services.',
      };
    }

    const route = allocation.route || {};
    const assignedStop = allocation.pickupStopName || allocation.dropoffStopName || 'Assigned Stop';

    // Scenario: Transport allocated, but no active trip in progress
    if (!activeTrip) {
      return {
        student: studentSummary,
        status: ParentLiveTrackingStatus.NO_ACTIVE_TRIP,
        liveTrackingEnabled: false,
        message: "No active trip is currently in progress for this student's route.",
        allocation: {
          id: allocation.id,
          routeName: route.routeName || 'Assigned Route',
          pickupStopName: allocation.pickupStopName,
          dropoffStopName: allocation.dropoffStopName,
        },
        route: {
          id: route.id,
          routeName: route.routeName,
          vehicleNumber: route.vehicleNumber,
          driverName: route.driverName,
          driverPhone: route.driverPhone,
        },
        childStatus: {
          status: BoardingStatus.WAITING,
          stopName: assignedStop,
        },
      };
    }

    // Active trip in progress: Fetch live telemetry
    const liveTracking = await this.trackingService.getLatestLocation(tenantId, {
      tripId: activeTrip.id,
      vehicleNumber: activeTrip.vehicleNumber || route.vehicleNumber,
    });

    const childStatus = {
      status: boardingRecord?.status || BoardingStatus.WAITING,
      stopName: boardingRecord?.stopName || assignedStop,
      boardingTime: boardingRecord?.boardingTime || null,
      dropoffTime: boardingRecord?.dropoffTime || null,
      notes: boardingRecord?.notes || null,
    };

    // Calculate ETA & proximity if coordinates available
    let etaInfo: any = null;
    const stopMatch = route.routeStops?.find((s: any) => s.stopName === assignedStop);
    if (liveTracking.latestLocation?.latitude && stopMatch?.latitude) {
      const distKm = this.calculateDistanceKm(
        liveTracking.latestLocation.latitude,
        liveTracking.latestLocation.longitude,
        stopMatch.latitude,
        stopMatch.longitude,
      );
      const currentSpeed = liveTracking.latestLocation.speed ?? 0;
      const speedKmH = currentSpeed > 5 ? currentSpeed : 30;
      const etaMins = Math.max(1, Math.round((distKm / speedKmH) * 60));

      etaInfo = {
        distanceKm: Math.round(distKm * 10) / 10,
        estimatedMinutesAway: etaMins,
        isApproachingStop: distKm <= 1.0,
      };
    }

    const isTrackingActive = liveTracking.enabled && liveTracking.status === 'ACTIVE';
    const isDisconnected = liveTracking.enabled && liveTracking.status === 'DISCONNECTED';

    let trackingStatus = ParentLiveTrackingStatus.NOT_ENABLED;
    let statusMessage = 'Live location is not enabled for this trip.';

    if (isTrackingActive) {
      trackingStatus = ParentLiveTrackingStatus.ACTIVE;
      statusMessage = 'Bus is currently en route.';
    } else if (isDisconnected) {
      trackingStatus = ParentLiveTrackingStatus.DISCONNECTED;
      statusMessage = 'GPS connection is currently delayed. Trip is continuing normally.';
    }

    return {
      student: studentSummary,
      status: trackingStatus,
      liveTrackingEnabled: liveTracking.enabled,
      message: statusMessage,
      trip: {
        id: activeTrip.id,
        status: activeTrip.status,
        startedAt: activeTrip.startedAt,
        trackingMode: activeTrip.trackingMode,
        route: {
          id: route.id,
          routeName: route.routeName,
          vehicleNumber: activeTrip.vehicleNumber || route.vehicleNumber,
          driverName: route.driverName,
          driverPhone: route.driverPhone,
        },
        vehicle: activeTrip.vehicle || null,
      },
      childStatus,
      liveLocation: isTrackingActive ? liveTracking.latestLocation : null,
      lastKnownLocation: isDisconnected ? liveTracking.latestLocation : null,
      eta: etaInfo,
    };
  }

  async getParentStudentsLiveTransport(tenantId: string, parentUserId: string) {
    if (this.prisma.isDbConnected) {
      const parent = await this.prisma.parent.findFirst({
        where: { tenantId, id: parentUserId },
        include: { students: { include: { student: true } } },
      });
      if (!parent) return [];

      const results = [];
      for (const sp of parent.students) {
        const live = await this.getStudentLiveTransport(tenantId, sp.studentId);
        results.push(live);
      }
      return results;
    }

    const students = Array.from(this.prisma.memoryStore.students.values()).filter((s) => s.tenantId === tenantId);
    const results = [];
    for (const student of students) {
      const live = await this.getStudentLiveTransport(tenantId, student.id);
      results.push(live);
    }
    return results;
  }

  private calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
