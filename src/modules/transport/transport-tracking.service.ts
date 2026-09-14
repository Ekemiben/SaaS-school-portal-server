import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { IngestTelemetryDto, TrackingMode } from './dto/fleet-and-trip.dto.js';
import { TrackingProviderFactory } from './tracking/tracking.providers.js';

@Injectable()
export class TransportTrackingService {
  private readonly logger = new Logger(TransportTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trackingFactory: TrackingProviderFactory,
  ) {}

  async ingestTelemetry(tenantId: string, telemetry: IngestTelemetryDto) {
    let trackingMode = telemetry.source || TrackingMode.PHONE;

    // 1. Verify trip if tripId is provided
    if (telemetry.tripId) {
      if (this.prisma.isDbConnected) {
        const trip = await this.prisma.transportTrip.findFirst({
          where: { id: telemetry.tripId, tenantId },
        });
        if (trip) {
          trackingMode = trip.trackingMode as TrackingMode;
        } else {
          throw new NotFoundException(`Trip "${telemetry.tripId}" not found for this school.`);
        }
      } else {
        const trip = this.prisma.memoryStore.transportTrips.get(telemetry.tripId);
        if (!trip || trip.tenantId !== tenantId) {
          throw new NotFoundException(`Trip "${telemetry.tripId}" not found for this school.`);
        }
        trackingMode = trip.trackingMode as TrackingMode;
      }
    } else if (telemetry.vehicleNumber) {
      // 2. Verify vehicle if vehicleNumber is provided
      if (this.prisma.isDbConnected) {
        const vehicle = await this.prisma.vehicle.findFirst({
          where: { vehicleNumber: telemetry.vehicleNumber.toUpperCase(), tenantId },
        });
        if (vehicle && vehicle.trackingMode) {
          trackingMode = vehicle.trackingMode as TrackingMode;
        }
      } else {
        const vehicle = Array.from(this.prisma.memoryStore.vehicles.values()).find(
          (v) => v.vehicleNumber === telemetry.vehicleNumber.toUpperCase() && v.tenantId === tenantId,
        );
        if (vehicle && vehicle.trackingMode) {
          trackingMode = vehicle.trackingMode as TrackingMode;
        }
      }
    }

    // 3. Dispatch to appropriate tracking provider
    const provider = this.trackingFactory.getProvider(trackingMode);
    return provider.processTelemetry(tenantId, telemetry);
  }

  async getLatestLocation(tenantId: string, identifier: { tripId?: string; vehicleNumber?: string }) {
    let trackingMode: TrackingMode = TrackingMode.NONE;

    if (identifier.tripId) {
      if (this.prisma.isDbConnected) {
        const trip = await this.prisma.transportTrip.findFirst({
          where: { id: identifier.tripId, tenantId },
        });
        if (trip) trackingMode = trip.trackingMode as TrackingMode;
      } else {
        const trip = this.prisma.memoryStore.transportTrips.get(identifier.tripId);
        if (trip && trip.tenantId === tenantId) trackingMode = trip.trackingMode as TrackingMode;
      }
    } else if (identifier.vehicleNumber) {
      if (this.prisma.isDbConnected) {
        const vehicle = await this.prisma.vehicle.findFirst({
          where: { vehicleNumber: identifier.vehicleNumber.toUpperCase(), tenantId },
        });
        if (vehicle) trackingMode = vehicle.trackingMode as TrackingMode;
      } else {
        const vehicle = Array.from(this.prisma.memoryStore.vehicles.values()).find(
          (v) => v.vehicleNumber === identifier.vehicleNumber?.toUpperCase() && v.tenantId === tenantId,
        );
        if (vehicle) trackingMode = vehicle.trackingMode as TrackingMode;
      }
    }

    const provider = this.trackingFactory.getProvider(trackingMode);
    return provider.getLiveStatus(tenantId, identifier);
  }
}
