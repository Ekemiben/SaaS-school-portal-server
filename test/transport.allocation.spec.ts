import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { TransportService } from '../src/modules/transport/transport.service.js';
import { TransportAllocationService } from '../src/modules/transport/transport-allocation.service.js';
import { AllocationStatus } from '../src/modules/transport/dto/transport.dto.js';

describe('Student Transport Allocation (Task 6)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let transportService: TransportService;
  let allocationService: TransportAllocationService;

  const tenantA = 'tenant_trans_alpha_01';
  const tenantB = 'tenant_trans_beta_02';

  const campusA1 = 'campus_trans_a1';
  const campusA2 = 'campus_trans_a2';
  const campusB1 = 'campus_trans_b1';

  const acadYearA = 'ay_trans_2026_a';
  const acadYearB = 'ay_trans_2026_b';

  const studentA1 = 'std_trans_a1';
  const studentA2 = 'std_trans_a2';
  const studentA3 = 'std_trans_a3';
  const studentA4 = 'std_trans_a4';
  const studentB1 = 'std_trans_b1';

  let routeA1Id: string;
  let routeA2SmallCapId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);

    transportService = new TransportService(prisma);
    allocationService = new TransportAllocationService(prisma);

    await rlsHelper.withBypassContext(async (tx) => {
      // Clean up previous test runs
      await tx.studentTransportAllocation.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.transportStop.deleteMany({ where: { route: { tenantId: { in: [tenantA, tenantB] } } } });
      await tx.transportRoute.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.student.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.academicYear.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });

      // Create Tenants
      await tx.tenant.create({ data: { id: tenantA, name: 'Alpha Transport Academy', slug: 'alpha-trans' } });
      await tx.tenant.create({ data: { id: tenantB, name: 'Beta Transport Academy', slug: 'beta-trans' } });

      // Create Campuses
      await tx.campus.create({ data: { id: campusA1, tenantId: tenantA, name: 'Alpha Main', code: 'A-MAIN' } });
      await tx.campus.create({ data: { id: campusA2, tenantId: tenantA, name: 'Alpha North', code: 'A-NORTH' } });
      await tx.campus.create({ data: { id: campusB1, tenantId: tenantB, name: 'Beta Main', code: 'B-MAIN' } });

      // Create Academic Years
      await tx.academicYear.create({
        data: { id: acadYearA, tenantId: tenantA, name: '2026/2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31') },
      });
      await tx.academicYear.create({
        data: { id: acadYearB, tenantId: tenantB, name: '2026/2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31') },
      });

      // Create Students
      await tx.student.create({
        data: { id: studentA1, tenantId: tenantA, campusId: campusA1, admissionNumber: 'ALPHA-001', firstName: 'Ada', lastName: 'Lovelace', gender: 'Female', dateOfBirth: new Date('2012-01-01') },
      });
      await tx.student.create({
        data: { id: studentA2, tenantId: tenantA, campusId: campusA1, admissionNumber: 'ALPHA-002', firstName: 'Alan', lastName: 'Turing', gender: 'Male', dateOfBirth: new Date('2012-02-02') },
      });
      await tx.student.create({
        data: { id: studentA3, tenantId: tenantA, campusId: campusA2, admissionNumber: 'ALPHA-003', firstName: 'Grace', lastName: 'Hopper', gender: 'Female', dateOfBirth: new Date('2012-03-03') },
      });
      await tx.student.create({
        data: { id: studentA4, tenantId: tenantA, campusId: campusA1, admissionNumber: 'ALPHA-004', firstName: 'Margaret', lastName: 'Hamilton', gender: 'Female', dateOfBirth: new Date('2012-05-05') },
      });
      await tx.student.create({
        data: { id: studentB1, tenantId: tenantB, campusId: campusB1, admissionNumber: 'BETA-001', firstName: 'Bob', lastName: 'Smith', gender: 'Male', dateOfBirth: new Date('2012-04-04') },
      });
    });

    // Create Route with capacity 30
    const r1 = await transportService.createRoute(tenantA, {
      campusId: campusA1,
      routeName: 'Lekki - Express Bus 1',
      vehicleNumber: 'BUS-101',
      driverName: 'Samuel Adeleke',
      driverPhone: '+2348011112222',
      capacity: 30,
      fee: 45000,
      stops: [
        { stopName: 'Ajah Roundabout', stopOrder: 1, pickupTime: '06:45', dropoffTime: '16:00' },
        { stopName: 'Chevron Gate', stopOrder: 2, pickupTime: '07:05', dropoffTime: '15:40' },
      ],
    });
    routeA1Id = r1.id;

    // Create Route with capacity 1 (to test capacity limit)
    const r2 = await transportService.createRoute(tenantA, {
      campusId: campusA1,
      routeName: 'Small Van Route',
      vehicleNumber: 'VAN-001',
      driverName: 'Sunday Bala',
      driverPhone: '+2348022223333',
      capacity: 1,
      fee: 50000,
    });
    routeA2SmallCapId = r2.id;
  });

  afterAll(async () => {
    await rlsHelper.withBypassContext(async (tx) => {
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

  it('1. Student Allocation: Successfully allocates student to route with stops and history', async () => {
    const allocation = await allocationService.allocateStudent(tenantA, {
      studentId: studentA1,
      routeId: routeA1Id,
      academicYearId: acadYearA,
      pickupStopName: 'Chevron Gate',
      dropoffStopName: 'Campus Gate',
      notes: 'Morning and afternoon pickup',
    });

    expect(allocation.id).toBeDefined();
    expect(allocation.tenantId).toBe(tenantA);
    expect(allocation.studentId).toBe(studentA1);
    expect(allocation.routeId).toBe(routeA1Id);
    expect(allocation.status).toBe(AllocationStatus.ACTIVE);
    expect(allocation.pickupStopName).toBe('Chevron Gate');
    expect(allocation.feeAmount).toBe(45000);
    expect(Array.isArray(allocation.history)).toBe(true);
    expect(allocation.history[0].action).toBe('ALLOCATED');
  });

  it('2. Duplicate Allocation Prevention: Rejects second active allocation for same student & period', async () => {
    await expect(
      allocationService.allocateStudent(tenantA, {
        studentId: studentA1,
        routeId: routeA1Id,
        academicYearId: acadYearA,
      }),
    ).rejects.toThrow(/already has an active transport allocation/);
  });

  it('3. Route Capacity Enforcement: Rejects allocation when route reaches capacity limit', async () => {
    // Allocate 1st student to small van (capacity: 1)
    await allocationService.allocateStudent(tenantA, {
      studentId: studentA2,
      routeId: routeA2SmallCapId,
      academicYearId: acadYearA,
    });

    // Attempt to allocate another student to the full route
    await expect(
      allocationService.allocateStudent(tenantA, {
        studentId: studentA4,
        routeId: routeA2SmallCapId,
        academicYearId: acadYearA,
      }),
    ).rejects.toThrow(/maximum passenger capacity/);
  });

  it('4. Tenant Isolation: Rejects allocation across different tenants', async () => {
    // Tenant B attempts to allocate Tenant A's student to Tenant B's context
    await expect(
      allocationService.allocateStudent(tenantB, {
        studentId: studentA1,
        routeId: routeA1Id,
        academicYearId: acadYearB,
      }),
    ).rejects.toThrow(/Student.*not found/);
  });

  it('5. Campus Isolation: Rejects allocation if student campus does not match route campus', async () => {
    // Student A3 belongs to campusA2, but routeA1 is campusA1
    await expect(
      allocationService.allocateStudent(tenantA, {
        studentId: studentA3,
        routeId: routeA1Id,
        academicYearId: acadYearA,
      }),
    ).rejects.toThrow(/Student campus does not match route campus/);
  });

  it('6. Allocation Lifecycle & Status Transitions: Tracks status updates in history', async () => {
    const list = await allocationService.listAllocations(tenantA, { studentId: studentA1 });
    const allocId = list[0].id;

    // Suspend allocation
    const updated = await allocationService.updateAllocation(tenantA, allocId, {
      status: AllocationStatus.SUSPENDED,
      reason: 'Parent requested temporary suspension for 2 weeks',
    });

    expect(updated.status).toBe(AllocationStatus.SUSPENDED);
    expect(updated.history.length).toBeGreaterThanOrEqual(2);
    const lastHistory = updated.history[updated.history.length - 1];
    expect(lastHistory.action).toBe('STATUS_CHANGED');
    expect(lastHistory.previousStatus).toBe(AllocationStatus.ACTIVE);
    expect(lastHistory.newStatus).toBe(AllocationStatus.SUSPENDED);
    expect(lastHistory.reason).toContain('temporary suspension');
  });

  it('7. Passenger Roster & Dynamic Route Enrollment: Calculates active riders accurately', async () => {
    // Reactivate student A1
    const list = await allocationService.listAllocations(tenantA, { studentId: studentA1 });
    await allocationService.updateAllocation(tenantA, list[0].id, {
      status: AllocationStatus.ACTIVE,
    });

    const passengers = await allocationService.getRoutePassengers(tenantA, routeA1Id, acadYearA);
    expect(passengers.length).toBe(1);
    expect(passengers[0].student.firstName).toBe('Ada');

    const routeData = await transportService.getRouteById(tenantA, routeA1Id);
    expect(routeData.enrolled).toBe(1);
    expect(routeData.capacity).toBe(30);
  });

  it('8. Route Deletion Safety: Prevents deleting routes with active student allocations', async () => {
    await expect(
      transportService.deleteRoute(tenantA, routeA1Id),
    ).rejects.toThrow(/Cannot delete a transport route with active student allocations/);
  });
});
