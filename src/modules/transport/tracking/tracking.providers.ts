import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { BullmqService } from '../../../jobs/bullmq.service.js';
import { TrackingMode, IngestTelemetryDto } from '../dto/fleet-and-trip.dto.js';
import { ITrackingProvider, LiveLocationStatus, LocationTelemetryResult } from './tracking-provider.interface.js';
import { randomUUID } from 'crypto';

@Injectable()
export class NoneTrackingProvider implements ITrackingProvider {
  getMode(): TrackingMode {
    return TrackingMode.NONE;
  }

  async processTelemetry(_tenantId: string, telemetry: IngestTelemetryDto): Promise<LocationTelemetryResult> {
    return {
      accepted: false,
      trackingMode: TrackingMode.NONE,
      vehicleNumber: telemetry.vehicleNumber,
      tripId: telemetry.tripId,
      recordedAt: new Date().toISOString(),
      source: 'NONE',
      message: 'Tracking is disabled (trackingMode = NONE). Telemetry ignored.',
    };
  }

  async getLiveStatus(_tenantId: string, _identifier: { tripId?: string; vehicleNumber?: string }): Promise<LiveLocationStatus> {
    return {
      enabled: false,
      trackingMode: TrackingMode.NONE,
      status: 'NOT_ENABLED',
      message: 'Live tracking is not enabled for this trip or vehicle.',
    };
  }
}

@Injectable()
export class PhoneTrackingProvider implements ITrackingProvider {
  private readonly logger = new Logger(PhoneTrackingProvider.name);
  private readonly memoryCache = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly bullmqService: BullmqService,
  ) {}

  getMode(): TrackingMode {
    return TrackingMode.PHONE;
  }

  async processTelemetry(tenantId: string, telemetry: IngestTelemetryDto): Promise<LocationTelemetryResult> {
    const recordedAt = telemetry.recordedAt ? new Date(telemetry.recordedAt) : new Date();
    const source = telemetry.source || TrackingMode.PHONE;

    const payload = {
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      speed: telemetry.speed,
      heading: telemetry.heading,
      accuracy: telemetry.accuracy,
      source,
      recordedAt: recordedAt.toISOString(),
      vehicleNumber: telemetry.vehicleNumber,
      tripId: telemetry.tripId,
      routeId: telemetry.routeId,
    };

    // 1. Transient cache in Redis
    const cacheKey = `tenant:${tenantId}:vehicle:${telemetry.vehicleNumber}:latest`;
    const tripCacheKey = telemetry.tripId ? `tenant:${tenantId}:trip:${telemetry.tripId}:latest` : null;

    try {
      const redis = this.bullmqService.getRedisClient();
      if (redis) {
        await redis.set(cacheKey, JSON.stringify(payload), 'EX', 900); // 15 min TTL
        if (tripCacheKey) {
          await redis.set(tripCacheKey, JSON.stringify(payload), 'EX', 900);
        }
      } else {
        this.memoryCache.set(cacheKey, payload);
        if (tripCacheKey) this.memoryCache.set(tripCacheKey, payload);
      }
    } catch {
      this.memoryCache.set(cacheKey, payload);
      if (tripCacheKey) this.memoryCache.set(tripCacheKey, payload);
    }

    // 2. Persistent storage in PostgreSQL
    if (this.prisma.isDbConnected) {
      await this.prisma.vehicleGpsLog.create({
        data: {
          tenantId,
          vehicleNumber: telemetry.vehicleNumber,
          routeId: telemetry.routeId,
          tripId: telemetry.tripId,
          latitude: telemetry.latitude,
          longitude: telemetry.longitude,
          speed: telemetry.speed,
          heading: telemetry.heading,
          accuracy: telemetry.accuracy,
          source,
          recordedAt,
        },
      });
    } else {
      const logId = `gps_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      this.prisma.memoryStore.vehicleGpsLogs.set(logId, {
        id: logId,
        tenantId,
        vehicleNumber: telemetry.vehicleNumber,
        routeId: telemetry.routeId,
        tripId: telemetry.tripId,
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        speed: telemetry.speed,
        heading: telemetry.heading,
        accuracy: telemetry.accuracy,
        source,
        recordedAt,
        createdAt: new Date(),
      });
    }

    return {
      accepted: true,
      trackingMode: TrackingMode.PHONE,
      vehicleNumber: telemetry.vehicleNumber,
      tripId: telemetry.tripId,
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      speed: telemetry.speed,
      heading: telemetry.heading,
      accuracy: telemetry.accuracy,
      recordedAt: recordedAt.toISOString(),
      source,
    };
  }

  async getLiveStatus(tenantId: string, identifier: { tripId?: string; vehicleNumber?: string }): Promise<LiveLocationStatus> {
    const key = identifier.tripId
      ? `tenant:${tenantId}:trip:${identifier.tripId}:latest`
      : `tenant:${tenantId}:vehicle:${identifier.vehicleNumber}:latest`;

    let cached: any = null;
    try {
      const redis = this.bullmqService.getRedisClient();
      if (redis) {
        const raw = await redis.get(key);
        if (raw) cached = JSON.parse(raw);
      }
    } catch {
      // Redis fallback
    }

    if (!cached) {
      cached = this.memoryCache.get(key);
    }

    // If not in cache, fallback to latest log from DB
    if (!cached && this.prisma.isDbConnected) {
      const latest = await this.prisma.vehicleGpsLog.findFirst({
        where: {
          tenantId,
          ...(identifier.tripId && { tripId: identifier.tripId }),
          ...(identifier.vehicleNumber && { vehicleNumber: identifier.vehicleNumber }),
        },
        orderBy: { recordedAt: 'desc' },
      });

      if (latest) {
        cached = {
          latitude: latest.latitude,
          longitude: latest.longitude,
          speed: latest.speed,
          heading: latest.heading,
          accuracy: latest.accuracy,
          recordedAt: latest.recordedAt.toISOString(),
          source: latest.source || 'PHONE',
        };
      }
    }

    if (cached) {
      const recTime = new Date(cached.recordedAt).getTime();
      const ageMs = Date.now() - recTime;
      const isStale = ageMs > 5 * 60 * 1000; // > 5 minutes

      return {
        enabled: true,
        trackingMode: this.getMode(),
        status: isStale ? 'DISCONNECTED' : 'ACTIVE',
        latestLocation: cached,
        message: isStale ? 'Vehicle GPS connection is currently delayed.' : 'Live tracking active.',
      };
    }

    return {
      enabled: true,
      trackingMode: this.getMode(),
      status: 'DISCONNECTED',
      message: 'Waiting for device to broadcast location.',
    };
  }
}

@Injectable()
export class GpsDeviceTrackingProvider extends PhoneTrackingProvider {
  override getMode(): TrackingMode {
    return TrackingMode.GPS_DEVICE;
  }
}

@Injectable()
export class TrackingProviderFactory {
  constructor(
    private readonly noneProvider: NoneTrackingProvider,
    private readonly phoneProvider: PhoneTrackingProvider,
    private readonly gpsDeviceProvider: GpsDeviceTrackingProvider,
  ) {}

  getProvider(mode?: TrackingMode | string): ITrackingProvider {
    switch (mode) {
      case TrackingMode.PHONE:
      case TrackingMode.SCHOOL_PHONE:
        return this.phoneProvider;
      case TrackingMode.GPS_DEVICE:
        return this.gpsDeviceProvider;
      case TrackingMode.NONE:
      default:
        return this.noneProvider;
    }
  }
}
