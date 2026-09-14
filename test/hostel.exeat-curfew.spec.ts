import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { HostelService } from '../src/modules/hostel/services/hostel.service.js';
import { HostelAllocationService } from '../src/modules/hostel/services/hostel-allocation.service.js';
import { HostelExeatService } from '../src/modules/hostel/services/hostel-exeat.service.js';
import { HostelCurfewService } from '../src/modules/hostel/services/hostel-curfew.service.js';

describe('Hostel Exeat Passes & Curfew Roll Call Workflow', () => {
  let moduleRef: TestingModule;
  let hostelService: HostelService;
  let allocationService: HostelAllocationService;
  let exeatService: HostelExeatService;
  let curfewService: HostelCurfewService;
  let prisma: PrismaService;

  const tenantId = 'tenant_hostel_beta';
  const campusId = 'campus_hostel_02';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, QueuesModule],
      providers: [
        HostelService,
        HostelAllocationService,
        HostelExeatService,
        HostelCurfewService,
      ],
    }).compile();

    hostelService = moduleRef.get<HostelService>(HostelService);
    allocationService = moduleRef.get<HostelAllocationService>(HostelAllocationService);
    exeatService = moduleRef.get<HostelExeatService>(HostelExeatService);
    curfewService = moduleRef.get<HostelCurfewService>(HostelCurfewService);
    prisma = moduleRef.get<PrismaService>(PrismaService);

    // Setup students
    prisma.memoryStore.students.set('std_res_101', {
      id: 'std_res_101',
      tenantId,
      campusId,
      admissionNumber: 'ADM-RES-101',
      firstName: 'Emeka',
      lastName: 'Nwosu',
      gender: 'MALE',
      status: 'ACTIVE',
    });

    prisma.memoryStore.students.set('std_res_102', {
      id: 'std_res_102',
      tenantId,
      campusId,
      admissionNumber: 'ADM-RES-102',
      firstName: 'Tunde',
      lastName: 'Bakare',
      gender: 'MALE',
      status: 'ACTIVE',
    });
  });

  it('should manage full exeat pass lifecycle: request -> approve -> departure -> return', async () => {
    const hostel = await hostelService.createHostel(tenantId, campusId, {
      name: 'Junior Boys Block',
      gender: 'BOYS',
    });

    const room = await hostelService.createRoom(tenantId, campusId, {
      hostelId: hostel.id,
      roomNumber: 'Room J-01',
      capacity: 4,
    });

    const bed = await hostelService.createBed(tenantId, campusId, {
      hostelId: hostel.id,
      roomId: room.id,
      bedNumber: 'Bed 1',
    });

    await allocationService.allocateBed(tenantId, campusId, 'staff_1', {
      studentId: 'std_res_101',
      hostelId: hostel.id,
      roomId: room.id,
      bedId: bed.id,
    });

    // 1. Invalid date validation (expected return <= departure)
    await expect(
      exeatService.requestExeat(tenantId, 'std_res_101', {
        studentId: 'std_res_101',
        hostelId: hostel.id,
        exeatType: 'WEEKEND_PASS',
        reason: 'Family wedding event',
        destinationAddress: '15 Lekki Phase 1, Lagos',
        emergencyPhone: '+234 802 334 4556',
        departureDate: new Date('2026-10-15T10:00:00Z').toISOString(),
        expectedReturnDate: new Date('2026-10-14T18:00:00Z').toISOString(),
      }),
    ).rejects.toThrow('Expected return date must be after departure date');

    // 2. Request exeat
    const exeat = await exeatService.requestExeat(tenantId, 'std_res_101', {
      studentId: 'std_res_101',
      hostelId: hostel.id,
      exeatType: 'WEEKEND_PASS',
      reason: 'Family wedding event',
      destinationAddress: '15 Lekki Phase 1, Lagos',
      emergencyPhone: '+234 802 334 4556',
      departureDate: new Date('2026-10-15T10:00:00Z').toISOString(),
      expectedReturnDate: new Date('2026-10-17T18:00:00Z').toISOString(),
    });

    expect(exeat).toBeDefined();
    expect(exeat.status).toBe('PENDING_APPROVAL');

    // 3. Warden approval
    const approved = await exeatService.approveOrRejectExeat(tenantId, exeat.id, 'warden_1', {
      approved: true,
      parentConsentStatus: 'APPROVED',
    });
    expect(approved.status).toBe('APPROVED');

    // 4. Log Departure
    const departed = await exeatService.logDeparture(tenantId, exeat.id, 'warden_1', {
      checkoutNotes: 'Left campus with elder sister',
    });
    expect(departed.status).toBe('DEPARTED');

    // 5. Log Return
    const returned = await exeatService.logReturn(tenantId, exeat.id, 'warden_1', {
      checkinNotes: 'Returned safely, luggage inspected',
    });
    expect(returned.status).toBe('RETURNED');
  });

  it('should detect overdue exeats when expected return time passes', async () => {
    const hostel = await hostelService.createHostel(tenantId, campusId, {
      name: 'Senior Boys Hall',
      gender: 'BOYS',
    });

    const exeat = await exeatService.requestExeat(tenantId, 'std_res_101', {
      studentId: 'std_res_101',
      hostelId: hostel.id,
      exeatType: 'MEDICAL_LEAVE',
      reason: 'Dental appointment in town',
      destinationAddress: 'St. Nicholas Hospital, Lagos',
      emergencyPhone: '+234 809 112 2334',
      departureDate: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      expectedReturnDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString(), // Past date
    });

    await exeatService.approveOrRejectExeat(tenantId, exeat.id, 'warden_1', {
      approved: true,
    });

    await exeatService.logDeparture(tenantId, exeat.id, 'warden_1', {});

    const overdueList = await exeatService.checkAndMarkOverdueExeats(tenantId);
    expect(overdueList.length).toBeGreaterThanOrEqual(1);
    expect(overdueList[0].status).toBe('OVERDUE');
  });

  it('should create curfew session, cross-reference active exeats, and record attendance with truancy detection', async () => {
    const hostel = await hostelService.createHostel(tenantId, campusId, {
      name: 'Mandela Hall',
      gender: 'BOYS',
    });

    const room = await hostelService.createRoom(tenantId, campusId, {
      hostelId: hostel.id,
      roomNumber: 'Room 10',
      capacity: 2,
    });

    const bed1 = await hostelService.createBed(tenantId, campusId, {
      hostelId: hostel.id,
      roomId: room.id,
      bedNumber: 'Bed 1',
    });

    const bed2 = await hostelService.createBed(tenantId, campusId, {
      hostelId: hostel.id,
      roomId: room.id,
      bedNumber: 'Bed 2',
    });

    await allocationService.allocateBed(tenantId, campusId, 'staff_1', {
      studentId: 'std_res_101',
      hostelId: hostel.id,
      roomId: room.id,
      bedId: bed1.id,
    });

    await allocationService.allocateBed(tenantId, campusId, 'staff_1', {
      studentId: 'std_res_102',
      hostelId: hostel.id,
      roomId: room.id,
      bedId: bed2.id,
    });

    // Student 101 goes on exeat
    const exeat = await exeatService.requestExeat(tenantId, 'std_res_101', {
      studentId: 'std_res_101',
      hostelId: hostel.id,
      exeatType: 'WEEKEND_PASS',
      reason: 'Home visit',
      destinationAddress: 'Victoria Island',
      emergencyPhone: '+234 803 111 2233',
      departureDate: new Date('2026-10-20T10:00:00Z').toISOString(),
      expectedReturnDate: new Date('2026-10-22T18:00:00Z').toISOString(),
    });
    await exeatService.approveOrRejectExeat(tenantId, exeat.id, 'warden_1', { approved: true });
    await exeatService.logDeparture(tenantId, exeat.id, 'warden_1', {});

    // Create Curfew Session
    const session = await curfewService.createSession(tenantId, campusId, 'warden_1', {
      hostelId: hostel.id,
      sessionType: 'NIGHT_CURFEW',
      notes: '9:00 PM Night Curfew Roll Call',
    });

    expect(session).toBeDefined();
    expect(session.totalExpected).toBe(2);
    expect(session.totalOnExeat).toBe(1);

    // Record Curfew Attendance
    const completedSession = await curfewService.recordAttendance(tenantId, session.id, 'warden_1', {
      attendances: [
        {
          studentId: 'std_res_101',
          roomId: room.id,
          bedId: bed1.id,
          status: 'EXEAT_ON_LEAVE',
          remarks: 'Approved weekend pass',
        },
        {
          studentId: 'std_res_102',
          roomId: room.id,
          bedId: bed2.id,
          status: 'PRESENT',
          remarks: 'In bed',
        },
      ],
    });

    expect(completedSession.status).toBe('COMPLETED');
    expect(completedSession.totalPresent).toBe(1);
    expect(completedSession.totalOnExeat).toBe(1);
    expect(completedSession.totalAbsent).toBe(0);
  });
});
