import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';

export interface GeofenceResult {
  isWithinGeofence: boolean;
  matchedLocationId?: string;
  matchedLocationName?: string;
  distanceMeters?: number;
  accuracyAcceptable: boolean;
  reason?: string;
}

@Injectable()
export class StaffAttendanceGeoService {
  private readonly logger = new Logger(StaffAttendanceGeoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates the distance in meters between two lat/lng coordinates using the Haversine formula.
   */
  calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Verifies if a user's reported GPS coordinates fall within any active geofenced location for the tenant/campus.
   */
  async verifyGeofence(
    tenantId: string,
    latitude?: number,
    longitude?: number,
    accuracy?: number,
    campusId?: string,
  ): Promise<GeofenceResult> {
    const config = await this.prisma.staffAttendanceConfig.findUnique({
      where: { tenantId },
    });

    const requireGps = config?.requireGps ?? true;
    const maxAccuracy = config?.maxAllowedGpsAccuracyMeters ?? 100;

    // If tenant does not enforce GPS, allow clocking
    if (!requireGps) {
      return {
        isWithinGeofence: true,
        accuracyAcceptable: true,
        reason: 'GPS enforcement disabled by tenant policy.',
      };
    }

    if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
      return {
        isWithinGeofence: false,
        accuracyAcceptable: false,
        reason: 'Missing GPS coordinates. Staff attendance requires location verification.',
      };
    }

    const accuracyAcceptable = accuracy === undefined || accuracy <= maxAccuracy;
    if (!accuracyAcceptable) {
      this.logger.warn(`GPS accuracy too low (${accuracy}m > max ${maxAccuracy}m) for tenant ${tenantId}`);
      return {
        isWithinGeofence: false,
        accuracyAcceptable: false,
        reason: `GPS accuracy is too low (${Math.round(accuracy)}m). Accuracy must be under ${maxAccuracy}m.`,
      };
    }

    // Fetch active locations for this tenant (and specific campus if provided)
    const locations = await this.prisma.staffAttendanceLocation.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(campusId ? { OR: [{ campusId }, { campusId: null }] } : {}),
      },
    });

    if (locations.length === 0) {
      // If no locations configured yet, log warning and allow if GPS is present
      this.logger.warn(`No active geofence locations defined for tenant ${tenantId}.`);
      return {
        isWithinGeofence: true,
        accuracyAcceptable: true,
        reason: 'No active geofence boundaries configured for school campus.',
      };
    }

    let closestLocation: (typeof locations)[0] | null = null;
    let minDistance = Infinity;

    for (const loc of locations) {
      const distance = this.calculateDistanceMeters(latitude, longitude, loc.latitude, loc.longitude);
      if (distance < minDistance) {
        minDistance = distance;
        closestLocation = loc;
      }
    }

    if (closestLocation && minDistance <= closestLocation.radiusMeters) {
      return {
        isWithinGeofence: true,
        matchedLocationId: closestLocation.id,
        matchedLocationName: closestLocation.name,
        distanceMeters: minDistance,
        accuracyAcceptable: true,
      };
    }

    return {
      isWithinGeofence: false,
      matchedLocationId: closestLocation?.id,
      matchedLocationName: closestLocation?.name,
      distanceMeters: minDistance,
      accuracyAcceptable: true,
      reason: closestLocation
        ? `You are ${Math.round(minDistance)}m away from "${closestLocation.name}". Must be within ${closestLocation.radiusMeters}m.`
        : 'Out of school geofence range.',
    };
  }
}
