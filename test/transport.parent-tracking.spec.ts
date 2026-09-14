import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { BullmqService } from '../src/jobs/bullmq.service.js';
import { TransportService } from '../src/modules/transport/transport.service.js';
import { TransportAllocationService } from '../src/modules/transport/transport-allocation.service.js';
import { VehicleService } from '../src/modules/transport/vehicle.service.js';
import { TripManagementService } from '../src/modules/transport/trip-management.service.js';
import { TransportTrackingService } from '../src/modules/transport/transport-tracking.service.js';
import { ParentLiveTrackingService } from '../src/modules/transport/parent-live-tracking.service.js';
import {
  NoneTrackingProvider,
  PhoneTrackingProvider,
  GpsDeviceTrackingProvider,
  TrackingProviderFactory,
} from '../src/modules/transport/tracking/tracking.providers.js';
import {
  TrackingMode,
  TripStatus,
  BoardingStatus,
} from '../src/modules/transport/dto/fleet-and-trip.dto.js';
import { ParentLiveTrackingStatus } from '../src/modules/transport/dto/parent-live-tracking.dto.js';

describe('Parent Live Tracking Experience (Task 9)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let bullmqService: BullmqService;
  let transportService: TransportService;
  let allocationService: TransportAllocationService;
  let vehicleService: VehicleService;
  let tripService: TripManagementService;
  let trackingService: TransportTrackingService;
  let parentTrackingService: ParentLiveTrackingService;

  const tenantA = 'tenant_parent_alpha_01';
  const tenantB = 'tenant_parent_beta_02';
  const campusA = 'campus_parent_a1';
  const campusB = 'campus_parent_b1';
  const acadYearA = 'ay_parent_2026_a';

  let parentA1: string;
  let parentUserA1: string;
  let studentA1: string;
  let studentA2: string;
  let studentA3Unassigned: string;
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
    parentTrackingService = new ParentLiveTrackingService(prisma, trackingService);

    parentUserA1 = 'usr_parent_a1';
    parentA1 = 'par_parent_01';
    studentA1 = 'std_parent_01';
    studentA2 = 'std_parent_02';
    studentA3Unassigned = 'std_parent_03';

    await rlsHelper.withBypassContext(async (tx) => {
      // Clean up previous runs
      await tx.vehicleGpsLog.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tripBoardingRecord.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.transportTrip.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.vehicle.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.studentTransportAllocation.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.transportStop.deleteMany({ where: { route: { tenantId: { in: [tenantA, tenantB] } } } });
      await tx.transportRoute.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.studentParent.deleteMany({ where: { student: { tenantId: { in: [tenantA, tenantB] } } } });
      await tx.parent.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.student.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.academicYear.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });

      // Create Tenants
      await tx.tenant.create({ data: { id: tenantA, name: 'Alpha Parent Academy', slug: 'parent-alpha' } });
      await tx.tenant.create({ data: { id: tenantB, name: 'Beta Parent Academy', slug: 'parent-beta' } });

      // Create Campuses
      await tx.campus.create({ data: { id: campusA, tenantId: tenantA, name: 'Alpha Main', code: 'A-MAIN' } });
      await tx.campus.create({ data: { id: campusB, tenantId: tenantB, name: 'Beta Main', code: 'B-MAIN' } });

      // Create Academic Year
      await tx.academicYear.create({
        data: { id: acadYearA, tenantId: tenantA, name: '2026/2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31') },
      });

      // Create Parent
      await tx.parent.create({
        data: { id: parentA1, tenantId: tenantA, firstName: 'Adebayo', lastName: 'Ogunlesi', phone: '+2348033333333', email: 'adebayo@example.com' },
      });

      // Create Students
      await tx.student.create({
        data: { id: studentA1, tenantId: tenantA, campusId: campusA, admissionNumber: 'PAR-001', firstName: 'Tari', lastName: 'Ogunlesi', gender: 'Female', dateOfBirth: new Date('2015-05-10') },
      });
      await tx.student.create({
        data: { id: studentA2, tenantId: tenantA, campusId: campusA, admissionNumber: 'PAR-002', firstName: 'Femi', lastName: 'Ogunlesi', gender: 'Male', dateOfBirth: new Date('2017-08-15') },
      });
      await tx.student.create({
        data: { id: studentA3Unassigned, tenantId: tenantA, campusId: campusA, admissionNumber: 'PAR-003', firstName: 'Dayo', lastName: 'Ogunlesi', gender: 'Male', dateOfBirth: new Date('2019-11-20') },
      });

      // Link Students to Parent
      await tx.studentParent.create({ data: { studentId: studentA1, parentId: parentA1, isPrimaryContact: true } });
      await tx.studentParent.create({ data: { studentId: studentA2, parentId: parentA1, isPrimaryContact: true } });
      await tx.studentParent.create({ data: { studentId: studentA3Unassigned, parentId: parentA1, isPrimaryContact: true } });
    });

    // Create Routes with geo stops
    const r1 = await transportService.createRoute(tenantA, {
      campusId: campusA,
      routeName: 'GPS Route Alpha',
      vehicleNumber: 'BUS-PAR-GPS',
      driverName: 'Driver Ibrahim',
      driverPhone: '+2348099999991',
      capacity: 35,
      stops: [
        { stopName: 'Estate Gate Stop', stopOrder: 1, pickupTime: '07:15', dropoffTime: '15:30', latitude: 6.4300, longitude: 3.5200 },
        { stopName: 'School Gate', stopOrder: 2, pickupTime: '07:45', dropoffTime: '15:00', latitude: 6.4400, longitude: 3.5300 },
      ],
    });
    routeA1 = r1.id;

    const r2 = await transportService.createRoute(tenantA, {
      campusId: campusA,
      routeName: 'Non-GPS Route Beta',
      vehicleNumber: 'BUS-PAR-MANUAL',
      driverName: 'Driver John',
      driverPhone: '+2348099999992',
      capacity: 35,
    });
    routeA2 = r2.id;

    // Allocate studentA1 to GPS route, studentA2 to Non-GPS route, studentA3 left unallocated
    await allocationService.allocateStudent(tenantA, {
      studentId: studentA1,
      routeId: routeA1,
      academicYearId: acadYearA,
      pickupStopName: 'Estate Gate Stop',
    });

    await allocationService.allocateStudent(tenantA, {
      studentId: studentA2,
      routeId: routeA2,
      academicYearId: acadYearA,
      pickupStopName: 'Lekki Junction',
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
      await tx.studentParent.deleteMany({ where: { student: { tenantId: { in: [tenantA, tenantB] } } } });
      await tx.parent.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.student.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.academicYear.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    });
    await prisma.onModuleDestroy();
  });

  it('1. Reports NO_ALLOCATION when student is not registered for transport', async () => {
    const live = await parentTrackingService.getStudentLiveTransport(tenantA, studentA3Unassigned);
    expect(live.status).toBe(ParentLiveTrackingStatus.NO_ALLOCATION);
    expect(live.liveTrackingEnabled).toBe(false);
    expect(live.message).toContain('not currently registered');
  });

  it('2. Reports NO_ACTIVE_TRIP when student is allocated but no bus is currently running', async () => {
    const live = await parentTrackingService.getStudentLiveTransport(tenantA, studentA1);
    expect(live.status).toBe(ParentLiveTrackingStatus.NO_ACTIVE_TRIP);
    expect(live.liveTrackingEnabled).toBe(false);
    expect(live.route.routeName).toBe('GPS Route Alpha');
    expect(live.childStatus.status).toBe(BoardingStatus.WAITING);
    expect(live.childStatus.stopName).toBe('Estate Gate Stop');
  });

  it('3. Reports NOT_ENABLED for active trip on non-GPS bus without error (Scenario B)', async () => {
    const trip = await tripService.startTrip(tenantA, {
      routeId: routeA2,
      trackingMode: TrackingMode.NONE,
    });

    const live = await parentTrackingService.getStudentLiveTransport(tenantA, studentA2);
    expect(live.status).toBe(ParentLiveTrackingStatus.NOT_ENABLED);
    expect(live.liveTrackingEnabled).toBe(false);
    expect(live.message).toBe('Live location is not enabled for this trip.');
    expect(live.trip.status).toBe(TripStatus.IN_PROGRESS);
    expect(live.childStatus.status).toBe(BoardingStatus.WAITING);

    // Record boarding
    await tripService.recordStudentBoarding(tenantA, trip.id, {
      studentId: studentA2,
      status: BoardingStatus.BOARDED,
      stopName: 'Lekki Junction',
    });

    const liveAfterBoarding = await parentTrackingService.getStudentLiveTransport(tenantA, studentA2);
    expect(liveAfterBoarding.childStatus.status).toBe(BoardingStatus.BOARDED);

    await tripService.updateTripStatus(tenantA, trip.id, { status: TripStatus.COMPLETED });
  });

  it('4. Reports ACTIVE with live telemetry, coordinates, and ETA calculation (Scenario C & E)', async () => {
    const trip = await tripService.startTrip(tenantA, {
      routeId: routeA1,
      vehicleNumber: 'BUS-PAR-GPS',
      trackingMode: TrackingMode.PHONE,
    });

    // Send telemetry close to 'Estate Gate Stop' (at 6.4300, 3.5200)
    await trackingService.ingestTelemetry(tenantA, {
      tripId: trip.id,
      vehicleNumber: 'BUS-PAR-GPS',
      latitude: 6.4250,
      longitude: 3.5180,
      speed: 35.0,
      heading: 45,
      source: TrackingMode.PHONE,
    });

    const live = await parentTrackingService.getStudentLiveTransport(tenantA, studentA1);
    expect(live.status).toBe(ParentLiveTrackingStatus.ACTIVE);
    expect(live.liveTrackingEnabled).toBe(true);
    expect(live.message).toBe('Bus is currently en route.');
    expect(live.liveLocation).toBeDefined();
    expect(live.liveLocation.latitude).toBe(6.4250);
    expect(live.eta).toBeDefined();
    expect(live.eta.distanceKm).toBeGreaterThan(0);
    expect(live.eta.estimatedMinutesAway).toBeGreaterThan(0);

    await tripService.updateTripStatus(tenantA, trip.id, { status: TripStatus.COMPLETED });
  });

  it('5. Reports DISCONNECTED when GPS signal is delayed without failing active trip', async () => {
    const trip = await tripService.startTrip(tenantA, {
      routeId: routeA1,
      vehicleNumber: 'BUS-PAR-GPS',
      trackingMode: TrackingMode.GPS_DEVICE,
    });

    // Ingest stale GPS record (> 5 minutes ago)
    await trackingService.ingestTelemetry(tenantA, {
      tripId: trip.id,
      vehicleNumber: 'BUS-PAR-GPS',
      latitude: 6.4100,
      longitude: 3.5000,
      recordedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    });

    const live = await parentTrackingService.getStudentLiveTransport(tenantA, studentA1);
    expect(live.status).toBe(ParentLiveTrackingStatus.DISCONNECTED);
    expect(live.liveTrackingEnabled).toBe(true);
    expect(live.message).toContain('GPS connection is currently delayed');
    expect(live.lastKnownLocation).toBeDefined();
    expect(live.lastKnownLocation.latitude).toBe(6.4100);

    await tripService.updateTripStatus(tenantA, trip.id, { status: TripStatus.COMPLETED });
  });

  it('6. Lists live transport statuses for all children of a parent', async () => {
    const list = await parentTrackingService.getParentStudentsLiveTransport(tenantA, parentA1);
    expect(list.length).toBe(3);
    const studentIds = list.map((item: any) => item.student.id);
    expect(studentIds).toContain(studentA1);
    expect(studentIds).toContain(studentA2);
    expect(studentIds).toContain(studentA3Unassigned);
  });

  it('7. Enforces tenant and parent authorization isolation', async () => {
    // Tenant B cannot view Tenant A student's live tracking
    await expect(
      parentTrackingService.getStudentLiveTransport(tenantB, studentA1),
    ).rejects.toThrow(/not found in this school organization/);

    // Parent from another family cannot access this student
    await expect(
      parentTrackingService.getStudentLiveTransport(tenantA, studentA1, { parentUserId: 'other_parent_user_999' }),
    ).rejects.toThrow(/not authorized/);
  });
});
