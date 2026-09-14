import { TrackingMode, IngestTelemetryDto } from '../dto/fleet-and-trip.dto.js';

export interface LocationTelemetryResult {
  accepted: boolean;
  trackingMode: TrackingMode;
  vehicleNumber: string;
  tripId?: string;
  latitude?: number;
  longitude?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  recordedAt: string;
  source: string;
  message?: string;
}

export interface LiveLocationStatus {
  enabled: boolean;
  trackingMode: TrackingMode;
  status: 'ACTIVE' | 'DISCONNECTED' | 'NOT_ENABLED';
  latestLocation?: {
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
    recordedAt: string;
    source: string;
  };
  message: string;
}

export interface ITrackingProvider {
  getMode(): TrackingMode;
  processTelemetry(tenantId: string, telemetry: IngestTelemetryDto): Promise<LocationTelemetryResult>;
  getLiveStatus(tenantId: string, identifier: { tripId?: string; vehicleNumber?: string }): Promise<LiveLocationStatus>;
}
