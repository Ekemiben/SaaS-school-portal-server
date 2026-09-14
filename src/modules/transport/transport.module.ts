import { Module } from '@nestjs/common';
import { TransportController } from './transport.controller.js';
import { TransportService } from './transport.service.js';
import { TransportAllocationService } from './transport-allocation.service.js';
import { VehicleService } from './vehicle.service.js';
import { TripManagementService } from './trip-management.service.js';
import { TransportTrackingService } from './transport-tracking.service.js';
import { TransportAttendanceService } from './transport-attendance.service.js';
import { ParentLiveTrackingService } from './parent-live-tracking.service.js';
import {
  NoneTrackingProvider,
  PhoneTrackingProvider,
  GpsDeviceTrackingProvider,
  TrackingProviderFactory,
} from './tracking/tracking.providers.js';

@Module({
  controllers: [TransportController],
  providers: [
    TransportService,
    TransportAllocationService,
    VehicleService,
    TripManagementService,
    TransportTrackingService,
    TransportAttendanceService,
    ParentLiveTrackingService,
    NoneTrackingProvider,
    PhoneTrackingProvider,
    GpsDeviceTrackingProvider,
    TrackingProviderFactory,
  ],
  exports: [
    TransportService,
    TransportAllocationService,
    VehicleService,
    TripManagementService,
    TransportTrackingService,
    TransportAttendanceService,
    ParentLiveTrackingService,
    TrackingProviderFactory,
  ],
})
export class TransportModule {}


