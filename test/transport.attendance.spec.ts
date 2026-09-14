import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { BullmqService } from '../src/jobs/bullmq.service.js';
import { TransportService } from '../src/modules/transport/transport.service.js';
import { TransportAllocationService } from '../src/modules/transport/transport-allocation.service.js';
import { VehicleService } from '../src/modules/transport/vehicle.service.js';
import { TripManagementService } from '../src/modules/transport/trip-management.service.js';
import { TransportAttendanceService } from '../src/modules/transport/transport-attendance.service.js';
import {
  NoneTrackingProvider,
  PhoneTrackingProvider,
  GpsDeviceTrackingProvider,
  TrackingProviderFactory,
} from '../src/modules/transport/tracking/tracking.providers.js';
import {
  BoardingStatus,
  TripStatus,
  TrackingMode,
} from '../src/modules/transport/dto/fleet-and-trip.dto.js';

describe('Transport Attendance & Parent Notifications (Task 8)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let bullmqService: BullmqService;
  let transportService: TransportService;
  let allocationService: TransportAllocationService;
  let vehicleService: VehicleService;
  let tripService: TripManagementService;
  let attendanceService: TransportAttendanceService;

  const tenantA = 'tenant_att_alpha_01';
  const tenantB = 'tenant_att_beta_02';
  const campusA = 'campus_att_a1';
  const campusB = 'campus_att_b1';
  const acadYearA = 'ay_att_2026_a';

  let parentA1: string;
  let parentA2: string;
  let studentA1: string;
  let studentA2: string;
  let routeA1: string;
  let tripA1: string;

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
    attendanceService = new TransportAttendanceService(prisma, bullmqService, tripService);

    await rlsHelper.withBypassContext(async (tx) => {
      // Clean up previous runs
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
      await tx.tenant.create({ data: { id: tenantA, name: 'Attendance Academy Alpha', slug: 'att-alpha' } });
      await tx.tenant.create({ data: { id: tenantB, name: 'Attendance Academy Beta', slug: 'att-beta' } });

      // Create Campuses
      await tx.campus.create({ data: { id: campusA, tenantId: tenantA, name: 'Alpha Main', code: 'A-MAIN' } });
      await tx.campus.create({ data: { id: campusB, tenantId: tenantB, name: 'Beta Main', code: 'B-MAIN' } });

      // Create Academic Year
      await tx.academicYear.create({
        data: { id: acadYearA, tenantId: tenantA, name: '2026/2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31') },
      });

      // Create Parents with phone and email for notification tests
      parentA1 = 'par_att_01';
      parentA2 = 'par_att_02';
      await tx.parent.create({
        data: { id: parentA1, tenantId: tenantA, firstName: 'Babatunde', lastName: 'Adeyemi', phone: '+2348011111111', email: 'babatunde@example.com' },
      });
      await tx.parent.create({
        data: { id: parentA2, tenantId: tenantA, firstName: 'Chidinma', lastName: 'Okeke', phone: '+2348022222222', email: 'chidinma@example.com' },
      });

      // Create Students
      studentA1 = 'std_att_01';
      studentA2 = 'std_att_02';
      await tx.student.create({
        data: { id: studentA1, tenantId: tenantA, campusId: campusA, admissionNumber: 'ATT-001', firstName: 'Kemi', lastName: 'Adeyemi', gender: 'Female', dateOfBirth: new Date('2014-03-01') },
      });
      await tx.student.create({
        data: { id: studentA2, tenantId: tenantA, campusId: campusA, admissionNumber: 'ATT-002', firstName: 'Emeka', lastName: 'Okeke', gender: 'Male', dateOfBirth: new Date('2014-04-02') },
      });

      // Link Students to Parents
      await tx.studentParent.create({ data: { studentId: studentA1, parentId: parentA1, isPrimaryContact: true } });
      await tx.studentParent.create({ data: { studentId: studentA2, parentId: parentA2, isPrimaryContact: true } });
    });

    // Create Route
    const r = await transportService.createRoute(tenantA, {
      campusId: campusA,
      routeName: 'Morning Route 1',
      vehicleNumber: 'BUS-ATT-01',
      driverName: 'Driver Musa',
      driverPhone: '+2348000000000',
      capacity: 30,
    });
    routeA1 = r.id;

    // Allocate students
    await allocationService.allocateStudent(tenantA, {
      studentId: studentA1,
      routeId: routeA1,
      academicYearId: acadYearA,
      pickupStopName: 'Gate 1 Stop',
    });
    await allocationService.allocateStudent(tenantA, {
      studentId: studentA2,
      routeId: routeA1,
      academicYearId: acadYearA,
      pickupStopName: 'Gate 2 Stop',
    });
  });

  afterAll(async () => {
    await rlsHelper.withBypassContext(async (tx) => {
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

  it('1. Starts a transport trip and initializes passenger roster', async () => {
    const trip = await tripService.startTrip(tenantA, {
      routeId: routeA1,
      trackingMode: TrackingMode.NONE,
      notes: 'Morning school run',
    });
    expect(trip.id).toBeDefined();
    expect(trip.status).toBe(TripStatus.IN_PROGRESS);
    expect(trip.passengerSummary.waiting).toBe(2);
    tripA1 = trip.id;
  });

  it('2. Records student pickup check-in (BOARDED) and queues parent notifications (SMS & Email)', async () => {
    const result = await attendanceService.recordCheckIn(
      tenantA,
      tripA1,
      {
        studentId: studentA1,
        status: BoardingStatus.BOARDED,
        stopName: 'Gate 1 Stop',
        notes: 'Boarded on time',
      },
      'driver_user_01',
    );

    expect(result.success).toBe(true);
    expect(result.checkInRecord.status).toBe(BoardingStatus.BOARDED);
    expect(result.checkInRecord.studentId).toBe(studentA1);
    expect(result.notificationsQueued).toBe(2); // 1 SMS + 1 Email
    expect(result.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: 'sms', recipient: '+2348011111111', status: 'QUEUED' }),
        expect.objectContaining({ channel: 'email', recipient: 'babatunde@example.com', status: 'QUEUED' }),
      ]),
    );

    const roster = await attendanceService.getTripAttendanceRoster(tenantA, tripA1);
    expect(roster.passengerSummary.boarded).toBe(1);
    expect(roster.passengerSummary.waiting).toBe(1);
  });

  it('3. Records student drop-off check-in (DROPPED_OFF) and queues parent confirmation', async () => {
    const result = await attendanceService.recordCheckIn(
      tenantA,
      tripA1,
      {
        studentId: studentA1,
        status: BoardingStatus.DROPPED_OFF,
        stopName: 'School Main Gate',
        notes: 'Safely arrived at school',
      },
      'driver_user_01',
    );

    expect(result.success).toBe(true);
    expect(result.checkInRecord.status).toBe(BoardingStatus.DROPPED_OFF);
    expect(result.notificationsQueued).toBe(2);

    const roster = await attendanceService.getTripAttendanceRoster(tenantA, tripA1);
    expect(roster.passengerSummary.droppedOff).toBe(1);
  });

  it('4. Performs batch check-in for multiple passengers', async () => {
    const batchResult = await attendanceService.batchRecordCheckIn(
      tenantA,
      tripA1,
      [
        {
          studentId: studentA2,
          status: BoardingStatus.BOARDED,
          stopName: 'Gate 2 Stop',
        },
      ],
      'driver_user_01',
    );

    expect(batchResult.totalProcessed).toBe(1);
    expect(batchResult.results[0].success).toBe(true);
    expect(batchResult.results[0].checkInRecord.status).toBe(BoardingStatus.BOARDED);

    const roster = await attendanceService.getTripAttendanceRoster(tenantA, tripA1);
    expect(roster.passengerSummary.boarded).toBe(1);
    expect(roster.passengerSummary.droppedOff).toBe(1);
    expect(roster.passengerSummary.waiting).toBe(0);
  });

  it('5. Retrieves student transport attendance history with trip details', async () => {
    const history = await attendanceService.getStudentAttendanceHistory(tenantA, studentA1);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].studentId).toBe(studentA1);
    expect(history[0].trip).toBeDefined();
    expect(history[0].trip.route.routeName).toBe('Morning Route 1');
  });

  it('6. Enforces tenant isolation for attendance operations', async () => {
    // Tenant B cannot check in student of Tenant A
    await expect(
      attendanceService.recordCheckIn(tenantB, tripA1, {
        studentId: studentA1,
        status: BoardingStatus.BOARDED,
      }),
    ).rejects.toThrow(/not found for this school/);

    // Tenant B cannot view attendance history of Tenant A's student
    await expect(
      attendanceService.getStudentAttendanceHistory(tenantB, studentA1),
    ).rejects.toThrow(/not found in this school organization/);
  });
});
