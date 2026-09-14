import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { BullmqService } from '../src/jobs/bullmq.service.js';
import { TransportService } from '../src/modules/transport/transport.service.js';
import { TransportAllocationService } from '../src/modules/transport/transport-allocation.service.js';
import { VehicleService } from '../src/modules/transport/vehicle.service.js';
import { TripManagementService } from '../src/modules/transport/trip-management.service.js';
import { TransportTrackingService } from '../src/modules/transport/transport-tracking.service.js';
import {
  NoneTrackingProvider,
  PhoneTrackingProvider,
  GpsDeviceTrackingProvider,
  TrackingProviderFactory,
} from '../src/modules/transport/tracking/tracking.providers.js';
import {
  TrackingMode,
  VehicleOwnershipType,
  TripStatus,
  BoardingStatus,
} from '../src/modules/transport/dto/fleet-and-trip.dto.js';

describe('Vehicle GPS Tracking & Fleet Scenarios (Task 7)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let bullmqService: BullmqService;
  let transportService: TransportService;
  let allocationService: TransportAllocationService;
  let vehicleService: VehicleService;
  let tripService: TripManagementService;
  let trackingService: TransportTrackingService;

  const tenantA = 'tenant_fleet_alpha_01';
  const tenantB = 'tenant_fleet_beta_02';
  const campusA = 'campus_fleet_a1';
  const campusB = 'campus_fleet_b1';
  const acadYearA = 'ay_fleet_2026_a';

  let studentA1: string;
  let studentA2: string;
  let routeA1: string;
  let routeA2: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);

    bullmqService = new BullmqService();
    const noneProvider = new NoneTrackingProvider();
    const phoneProvider = new PhoneTrackingProvider(prisma, bullmqService);
    const gpsProvider = new GpsDeviceTrackingProvider(prisma, bullmqService);
    const factory = new TrackingProviderFactory(noneProvider, phoneProvider, gpsProvider);

    transportService = new TransportService(prisma);
    allocationService = new TransportAllocationService(prisma);
    vehicleService = new VehicleService(prisma);
    tripService = new TripManagementService(prisma, factory);
    trackingService = new TransportTrackingService(prisma, factory);

    await rlsHelper.withBypassContext(async (tx) => {
      // Clean up previous test runs
      await tx.vehicleGpsLog.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tripBoardingRecord.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.transportTrip.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.vehicle.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.studentTransportAllocation.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.transportStop.deleteMany({ where: { route: { tenantId: { in: [tenantA, tenantB] } } } });
      await tx.transportRoute.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.student.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.academicYear.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });

      // Create Tenants
      await tx.tenant.create({ data: { id: tenantA, name: 'Alpha Fleet Academy', slug: 'alpha-fleet' } });
      await tx.tenant.create({ data: { id: tenantB, name: 'Beta Fleet Academy', slug: 'beta-fleet' } });

      // Create Campuses
      await tx.campus.create({ data: { id: campusA, tenantId: tenantA, name: 'Alpha Campus', code: 'A-CAMP' } });
      await tx.campus.create({ data: { id: campusB, tenantId: tenantB, name: 'Beta Campus', code: 'B-CAMP' } });

      // Create Academic Year
      await tx.academicYear.create({
        data: { id: acadYearA, tenantId: tenantA, name: '2026/2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31') },
      });

      // Create Students
      studentA1 = 'std_fl_01';
      studentA2 = 'std_fl_02';
      await tx.student.create({
        data: { id: studentA1, tenantId: tenantA, campusId: campusA, admissionNumber: 'AF-001', firstName: 'Kemi', lastName: 'Adeyemi', gender: 'Female', dateOfBirth: new Date('2013-01-01') },
      });
      await tx.student.create({
        data: { id: studentA2, tenantId: tenantA, campusId: campusA, admissionNumber: 'AF-002', firstName: 'Emeka', lastName: 'Okeke', gender: 'Male', dateOfBirth: new Date('2013-02-02') },
      });
    });

    // Create Routes
    const r1 = await transportService.createRoute(tenantA, {
      campusId: campusA,
      routeName: 'Main Route 1',
      vehicleNumber: 'BUS-100',
      driverName: 'Driver Dan',
      driverPhone: '+2348000000001',
      capacity: 30,
    });
    routeA1 = r1.id;

    const r2 = await transportService.createRoute(tenantA, {
      campusId: campusA,
      routeName: 'Main Route 2',
      vehicleNumber: 'BUS-200',
      driverName: 'Driver Dave',
      driverPhone: '+2348000000002',
      capacity: 30,
    });
    routeA2 = r2.id;

    // Allocate students to routeA1
    await allocationService.allocateStudent(tenantA, {
      studentId: studentA1,
      routeId: routeA1,
      academicYearId: acadYearA,
      pickupStopName: 'Roundabout 1',
    });
    await allocationService.allocateStudent(tenantA, {
      studentId: studentA2,
      routeId: routeA1,
      academicYearId: acadYearA,
      pickupStopName: 'Roundabout 2',
    });
  });

  afterAll(async () => {
    await rlsHelper.withBypassContext(async (tx) => {
      await tx.vehicleGpsLog.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tripBoardingRecord.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.transportTrip.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.vehicle.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.studentTransportAllocation.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.transportStop.deleteMany({ where: { route: { tenantId: { in: [tenantA, tenantB] } } } });
      await tx.transportRoute.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.student.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.academicYear.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    });
    await prisma.onModuleDestroy();
  });

  it('Test 1 (Scenario A): School with No bus, No phone, No GPS operates full trip and boarding', async () => {
    const trip = await tripService.startTrip(tenantA, {
      routeId: routeA1,
      trackingMode: TrackingMode.NONE,
      notes: 'Manual transport provider walking bus',
    });

    expect(trip.id).toBeDefined();
    expect(trip.status).toBe(TripStatus.IN_PROGRESS);
    expect(trip.liveTracking.enabled).toBe(false);
    expect(trip.liveTracking.status).toBe('NOT_ENABLED');
    expect(trip.passengerSummary.waiting).toBe(2);

    // Record boarding for studentA1
    const boarding = await tripService.recordStudentBoarding(tenantA, trip.id, {
      studentId: studentA1,
      status: BoardingStatus.BOARDED,
      stopName: 'Roundabout 1',
    });
    expect(boarding.status).toBe(BoardingStatus.BOARDED);

    const updatedTrip = await tripService.getTripDetails(tenantA, trip.id);
    expect(updatedTrip.passengerSummary.boarded).toBe(1);
    expect(updatedTrip.passengerSummary.waiting).toBe(1);

    // End trip
    await tripService.updateTripStatus(tenantA, trip.id, { status: TripStatus.COMPLETED });
  });

  it('Test 2 (Scenario B): Bus with No GPS works seamlessly and reports clean NOT_ENABLED tracking status', async () => {
    const veh = await vehicleService.createVehicle(tenantA, {
      vehicleNumber: 'BUS-NO-GPS',
      model: 'Toyota Coaster',
      capacity: 35,
      ownershipType: VehicleOwnershipType.SCHOOL_OWNED,
      trackingMode: TrackingMode.NONE,
    });
    expect(veh.trackingEnabled).toBe(false);

    const trip = await tripService.startTrip(tenantA, {
      routeId: routeA1,
      vehicleId: veh.id,
      trackingMode: TrackingMode.NONE,
    });

    expect(trip.liveTracking.status).toBe('NOT_ENABLED');
    expect(trip.liveTracking.message).toContain('Live tracking is not enabled');

    // Record drop-off for studentA1
    await tripService.recordStudentBoarding(tenantA, trip.id, {
      studentId: studentA1,
      status: BoardingStatus.DROPPED_OFF,
      stopName: 'Campus Arrival',
    });

    const details = await tripService.getTripDetails(tenantA, trip.id);
    expect(details.passengerSummary.droppedOff).toBe(1);
    await tripService.updateTripStatus(tenantA, trip.id, { status: TripStatus.COMPLETED });
  });

  it('Test 3 (Scenario C): Bus with Driver Phone ingests live telemetry and tracks active position', async () => {
    const trip = await tripService.startTrip(tenantA, {
      routeId: routeA1,
      vehicleNumber: 'BUS-DRIVER-PHONE',
      trackingMode: TrackingMode.PHONE,
    });

    expect(trip.trackingMode).toBe(TrackingMode.PHONE);

    // Ingest telemetry from driver phone
    const res = await trackingService.ingestTelemetry(tenantA, {
      tripId: trip.id,
      vehicleNumber: 'BUS-DRIVER-PHONE',
      latitude: 6.4281,
      longitude: 3.5218,
      speed: 42.5,
      heading: 180,
      source: TrackingMode.PHONE,
    });

    expect(res.accepted).toBe(true);
    expect(res.latitude).toBe(6.4281);

    const live = await trackingService.getLatestLocation(tenantA, { tripId: trip.id });
    expect(live.enabled).toBe(true);
    expect(live.status).toBe('ACTIVE');
    expect(live.latestLocation?.latitude).toBe(6.4281);

    await tripService.updateTripStatus(tenantA, trip.id, { status: TripStatus.COMPLETED });
  });

  it('Test 4 (Scenario D): Bus with School-Owned Phone functions as dedicated vehicle tracker', async () => {
    const schoolPhoneVeh = await vehicleService.createVehicle(tenantA, {
      vehicleNumber: 'BUS-SCH-PHONE',
      ownershipType: VehicleOwnershipType.SCHOOL_OWNED,
      trackingEnabled: true,
      trackingMode: TrackingMode.SCHOOL_PHONE,
      deviceId: 'IMEI-88992211',
    });

    const trip = await tripService.startTrip(tenantA, {
      routeId: routeA1,
      vehicleId: schoolPhoneVeh.id,
    });
    expect(trip.trackingMode).toBe(TrackingMode.SCHOOL_PHONE);

    await trackingService.ingestTelemetry(tenantA, {
      tripId: trip.id,
      vehicleNumber: 'BUS-SCH-PHONE',
      latitude: 6.4300,
      longitude: 3.5300,
      source: TrackingMode.SCHOOL_PHONE,
    });

    const live = await trackingService.getLatestLocation(tenantA, { vehicleNumber: 'BUS-SCH-PHONE' });
    expect(live.enabled).toBe(true);
    expect(live.latestLocation?.latitude).toBe(6.4300);

    await tripService.updateTripStatus(tenantA, trip.id, { status: TripStatus.COMPLETED });
  });

  it('Test 5 (Scenario E): Bus with Dedicated GPS hardware device ingests telematics feed', async () => {
    const gpsVeh = await vehicleService.createVehicle(tenantA, {
      vehicleNumber: 'BUS-GPS-HARDWARE',
      trackingEnabled: true,
      trackingMode: TrackingMode.GPS_DEVICE,
      deviceId: 'TELTONIKA-FMB920-001',
    });

    const trip = await tripService.startTrip(tenantA, {
      routeId: routeA2,
      vehicleId: gpsVeh.id,
    });

    await trackingService.ingestTelemetry(tenantA, {
      tripId: trip.id,
      vehicleNumber: 'BUS-GPS-HARDWARE',
      latitude: 6.4500,
      longitude: 3.6000,
      speed: 60.0,
      source: TrackingMode.GPS_DEVICE,
    });

    const live = await trackingService.getLatestLocation(tenantA, { tripId: trip.id });
    expect(live.enabled).toBe(true);
    expect(live.trackingMode).toBe(TrackingMode.GPS_DEVICE);
    expect(live.latestLocation?.speed).toBe(60.0);

    await tripService.updateTripStatus(tenantA, trip.id, { status: TripStatus.COMPLETED });
  });

  it('Test 6: Mixed Tracking Modes within the same school operate concurrently and independently', async () => {
    const trip1 = await tripService.startTrip(tenantA, { routeId: routeA1, vehicleNumber: 'V-NONE', trackingMode: TrackingMode.NONE });
    const trip2 = await tripService.startTrip(tenantA, { routeId: routeA1, vehicleNumber: 'V-PHONE', trackingMode: TrackingMode.PHONE });
    const trip3 = await tripService.startTrip(tenantA, { routeId: routeA2, vehicleNumber: 'V-GPS', trackingMode: TrackingMode.GPS_DEVICE });

    expect(trip1.trackingMode).toBe(TrackingMode.NONE);
    expect(trip2.trackingMode).toBe(TrackingMode.PHONE);
    expect(trip3.trackingMode).toBe(TrackingMode.GPS_DEVICE);

    await tripService.updateTripStatus(tenantA, trip1.id, { status: TripStatus.COMPLETED });
    await tripService.updateTripStatus(tenantA, trip2.id, { status: TripStatus.COMPLETED });
    await tripService.updateTripStatus(tenantA, trip3.id, { status: TripStatus.COMPLETED });
  });

  it('Test 7: Tracking connection becomes delayed/unavailable during active trip without failing trip', async () => {
    const trip = await tripService.startTrip(tenantA, {
      routeId: routeA1,
      vehicleNumber: 'BUS-STALE-GPS',
      trackingMode: TrackingMode.PHONE,
    });

    // Ingest old timestamp (>5 min ago)
    await trackingService.ingestTelemetry(tenantA, {
      tripId: trip.id,
      vehicleNumber: 'BUS-STALE-GPS',
      latitude: 6.4000,
      longitude: 3.5000,
      recordedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    const live = await trackingService.getLatestLocation(tenantA, { tripId: trip.id });
    expect(live.status).toBe('DISCONNECTED');
    expect(live.message).toContain('GPS connection is currently delayed');

    // Trip operations continue smoothly
    const boarding = await tripService.recordStudentBoarding(tenantA, trip.id, {
      studentId: studentA1,
      status: BoardingStatus.BOARDED,
    });
    expect(boarding.status).toBe(BoardingStatus.BOARDED);

    await tripService.updateTripStatus(tenantA, trip.id, { status: TripStatus.COMPLETED });
  });

  it('Test 8 & 9: GPS unavailable before trip start then reconnects smoothly during active trip', async () => {
    const trip = await tripService.startTrip(tenantA, {
      routeId: routeA1,
      vehicleNumber: 'BUS-RECONNECT',
      trackingMode: TrackingMode.PHONE,
    });

    // Initially disconnected
    const initialLive = await trackingService.getLatestLocation(tenantA, { tripId: trip.id });
    expect(initialLive.status).toBe('DISCONNECTED');

    // Telemetry reconnects mid-trip
    await trackingService.ingestTelemetry(tenantA, {
      tripId: trip.id,
      vehicleNumber: 'BUS-RECONNECT',
      latitude: 6.4400,
      longitude: 3.5500,
    });

    const reconnectedLive = await trackingService.getLatestLocation(tenantA, { tripId: trip.id });
    expect(reconnectedLive.status).toBe('ACTIVE');
    expect(reconnectedLive.latestLocation?.latitude).toBe(6.4400);

    await tripService.updateTripStatus(tenantA, trip.id, { status: TripStatus.COMPLETED });
  });

  it('Test 10: Multi-Tenant Isolation blocks cross-tenant trip and vehicle operations', async () => {
    // Tenant B attempts to start trip for Tenant A's route
    await expect(
      tripService.startTrip(tenantB, { routeId: routeA1 }),
    ).rejects.toThrow(/not found in this school/);

    // Tenant B attempts to ingest telemetry for Tenant A's trip
    const tripA = await tripService.startTrip(tenantA, { routeId: routeA1 });
    await expect(
      trackingService.ingestTelemetry(tenantB, {
        tripId: tripA.id,
        vehicleNumber: 'BUS-100',
        latitude: 6.4,
        longitude: 3.5,
      }),
    ).rejects.toThrow(/not found for this school/);

    await tripService.updateTripStatus(tenantA, tripA.id, { status: TripStatus.COMPLETED });
  });
});
