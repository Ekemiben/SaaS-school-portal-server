import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { HostelService } from '../src/modules/hostel/services/hostel.service.js';
import { HostelAllocationService } from '../src/modules/hostel/services/hostel-allocation.service.js';
import { HostelAnalyticsService } from '../src/modules/hostel/services/hostel-analytics.service.js';

describe('Hostel Management & Bed Allocation Workflow', () => {
  let moduleRef: TestingModule;
  let hostelService: HostelService;
  let allocationService: HostelAllocationService;
  let analyticsService: HostelAnalyticsService;
  let prisma: PrismaService;

  const tenantId = 'tenant_hostel_alpha';
  const campusId = 'campus_hostel_01';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, QueuesModule],
      providers: [
        HostelService,
        HostelAllocationService,
        HostelAnalyticsService,
      ],
    }).compile();

    hostelService = moduleRef.get<HostelService>(HostelService);
    allocationService = moduleRef.get<HostelAllocationService>(HostelAllocationService);
    analyticsService = moduleRef.get<HostelAnalyticsService>(HostelAnalyticsService);
    prisma = moduleRef.get<PrismaService>(PrismaService);

    // Setup student in memoryStore
    prisma.memoryStore.students.set('std_male_001', {
      id: 'std_male_001',
      tenantId,
      campusId,
      admissionNumber: 'ADM-BOY-001',
      firstName: 'David',
      lastName: 'Adeleke',
      gender: 'MALE',
      status: 'ACTIVE',
    });

    prisma.memoryStore.students.set('std_female_001', {
      id: 'std_female_001',
      tenantId,
      campusId,
      admissionNumber: 'ADM-GIRL-001',
      firstName: 'Tiwa',
      lastName: 'Savage',
      gender: 'FEMALE',
      status: 'ACTIVE',
    });
  });

  it('should create hostel, rooms, beds and automatically track capacity', async () => {
    const hostel = await hostelService.createHostel(tenantId, campusId, {
      name: 'Nelson Mandela Hall (Boys)',
      code: 'HST-01',
      gender: 'BOYS',
      wardenName: 'Mr. Chukwuma Okafor',
      wardenPhone: '+234 803 999 1122',
      status: 'ACTIVE',
    });

    expect(hostel).toBeDefined();
    expect(hostel.name).toBe('Nelson Mandela Hall (Boys)');

    const room = await hostelService.createRoom(tenantId, campusId, {
      hostelId: hostel.id,
      roomNumber: 'Room 101',
      floor: 'Ground Floor',
      roomType: 'STANDARD',
      capacity: 2,
    });

    expect(room).toBeDefined();
    expect(room.capacity).toBe(2);

    const bedA = await hostelService.createBed(tenantId, campusId, {
      hostelId: hostel.id,
      roomId: room.id,
      bedNumber: 'Bed A (Lower)',
    });

    const bedB = await hostelService.createBed(tenantId, campusId, {
      hostelId: hostel.id,
      roomId: room.id,
      bedNumber: 'Bed B (Upper)',
    });

    expect(bedA).toBeDefined();
    expect(bedB).toBeDefined();

    const updatedHostel = await hostelService.getHostelById(tenantId, hostel.id);
    expect(updatedHostel.totalRooms).toBe(1);
    expect(updatedHostel.totalBeds).toBe(2);
    expect(updatedHostel.occupiedBeds).toBe(0);
  });

  it('should allocate bed to student, enforce gender rule, and prevent double allocation', async () => {
    const hostel = await hostelService.createHostel(tenantId, campusId, {
      name: 'Nelson Mandela Hall (Boys)',
      gender: 'BOYS',
    });

    const room = await hostelService.createRoom(tenantId, campusId, {
      hostelId: hostel.id,
      roomNumber: 'Room 201',
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

    // 1. Gender restriction: female in boys hostel
    await expect(
      allocationService.allocateBed(tenantId, campusId, 'staff_1', {
        studentId: 'std_female_001',
        hostelId: hostel.id,
        roomId: room.id,
        bedId: bed1.id,
      }),
    ).rejects.toThrow('Cannot allocate female student to a Boys hostel');

    // 2. Successful allocation
    const allocation = await allocationService.allocateBed(tenantId, campusId, 'staff_1', {
      studentId: 'std_male_001',
      hostelId: hostel.id,
      roomId: room.id,
      bedId: bed1.id,
    });

    expect(allocation).toBeDefined();
    expect(allocation.status).toBe('ACTIVE');

    const updatedBed1 = await hostelService.getBedById(tenantId, bed1.id);
    expect(updatedBed1.status).toBe('OCCUPIED');

    const updatedHostel = await hostelService.getHostelById(tenantId, hostel.id);
    expect(updatedHostel.occupiedBeds).toBe(1);

    // 3. Attempting double allocation for the same student
    await expect(
      allocationService.allocateBed(tenantId, campusId, 'staff_1', {
        studentId: 'std_male_001',
        hostelId: hostel.id,
        roomId: room.id,
        bedId: bed2.id,
      }),
    ).rejects.toThrow('Student already has an active bed allocation');
  });

  it('should transfer bed to a new room and vacate on student checkout', async () => {
    const hostel = await hostelService.createHostel(tenantId, campusId, {
      name: 'Nelson Mandela Hall (Boys)',
      gender: 'BOYS',
    });

    const roomA = await hostelService.createRoom(tenantId, campusId, {
      hostelId: hostel.id,
      roomNumber: 'Room 301',
      capacity: 1,
    });
    const bedA = await hostelService.createBed(tenantId, campusId, {
      hostelId: hostel.id,
      roomId: roomA.id,
      bedNumber: 'Bed A',
    });

    const roomB = await hostelService.createRoom(tenantId, campusId, {
      hostelId: hostel.id,
      roomNumber: 'Room 302',
      capacity: 1,
    });
    const bedB = await hostelService.createBed(tenantId, campusId, {
      hostelId: hostel.id,
      roomId: roomB.id,
      bedNumber: 'Bed B',
    });

    const initialAllocation = await allocationService.allocateBed(tenantId, campusId, 'staff_1', {
      studentId: 'std_male_001',
      hostelId: hostel.id,
      roomId: roomA.id,
      bedId: bedA.id,
    });

    // Transfer from Room 301 to Room 302
    const transferred = await allocationService.transferBed(tenantId, initialAllocation.id, 'staff_1', {
      newHostelId: hostel.id,
      newRoomId: roomB.id,
      newBedId: bedB.id,
      transferReason: 'Prefect appointment room upgrade',
    });

    expect(transferred).toBeDefined();
    expect(transferred.roomId).toBe(roomB.id);

    const oldBed = await hostelService.getBedById(tenantId, bedA.id);
    const newBed = await hostelService.getBedById(tenantId, bedB.id);
    expect(oldBed.status).toBe('VACANT');
    expect(newBed.status).toBe('OCCUPIED');

    // Vacate bed
    const vacated = await allocationService.vacateBed(tenantId, transferred.id, {
      checkoutReason: 'End of term vacation',
    });

    expect(vacated.status).toBe('VACATED');
    const checkedBedB = await hostelService.getBedById(tenantId, bedB.id);
    expect(checkedBedB.status).toBe('VACANT');

    const summary = await analyticsService.getHostelSummary(tenantId);
    expect(summary.totalOccupied).toBe(0);
  });
});
