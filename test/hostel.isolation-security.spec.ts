import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { HostelService } from '../src/modules/hostel/services/hostel.service.js';
import { HostelAllocationService } from '../src/modules/hostel/services/hostel-allocation.service.js';
import { HostelExeatService } from '../src/modules/hostel/services/hostel-exeat.service.js';
import { SystemPermissions } from '../src/common/constants/permissions.js';

describe('Hostel Multi-Tenant Isolation & Security', () => {
  let moduleRef: TestingModule;
  let hostelService: HostelService;
  let allocationService: HostelAllocationService;
  let exeatService: HostelExeatService;
  let prisma: PrismaService;

  const tenantA = 'tenant_hostel_alpha';
  const tenantB = 'tenant_hostel_beta';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, QueuesModule],
      providers: [
        HostelService,
        HostelAllocationService,
        HostelExeatService,
      ],
    }).compile();

    hostelService = moduleRef.get<HostelService>(HostelService);
    allocationService = moduleRef.get<HostelAllocationService>(HostelAllocationService);
    exeatService = moduleRef.get<HostelExeatService>(HostelExeatService);
    prisma = moduleRef.get<PrismaService>(PrismaService);
  });

  it('should enforce strict cross-tenant isolation for hostels and rooms', async () => {
    const hostelA = await hostelService.createHostel(tenantA, 'campus_a', {
      name: 'Alpha Boys Hall',
      gender: 'BOYS',
    });

    const hostelB = await hostelService.createHostel(tenantB, 'campus_b', {
      name: 'Beta Boys Hall',
      gender: 'BOYS',
    });

    const listA = await hostelService.listHostels(tenantA);
    const listB = await hostelService.listHostels(tenantB);

    expect(listA.some((h) => h.id === hostelA.id)).toBe(true);
    expect(listA.some((h) => h.id === hostelB.id)).toBe(false);

    expect(listB.some((h) => h.id === hostelB.id)).toBe(true);
    expect(listB.some((h) => h.id === hostelA.id)).toBe(false);

    // Cross-tenant lookup should throw NotFoundException
    await expect(hostelService.getHostelById(tenantA, hostelB.id)).rejects.toThrow('not found');
  });

  it('should prevent cross-tenant exeat access', async () => {
    prisma.memoryStore.students.set('std_tenant_a', {
      id: 'std_tenant_a',
      tenantId: tenantA,
      admissionNumber: 'ADM-TA-01',
      firstName: 'Alice',
      lastName: 'Smith',
      gender: 'FEMALE',
      status: 'ACTIVE',
    });

    const hostelA = await hostelService.createHostel(tenantA, 'campus_a', {
      name: 'Alpha Girls Hall',
      gender: 'GIRLS',
    });

    const exeatA = await exeatService.requestExeat(tenantA, 'std_tenant_a', {
      studentId: 'std_tenant_a',
      hostelId: hostelA.id,
      exeatType: 'DAY_PASS',
      reason: 'Medical checkup',
      destinationAddress: 'Main clinic',
      emergencyPhone: '+234 801 000 0000',
      departureDate: new Date('2026-11-01T08:00:00Z').toISOString(),
      expectedReturnDate: new Date('2026-11-01T16:00:00Z').toISOString(),
    });

    // Tenant B cannot fetch Tenant A's exeat
    await expect(exeatService.getExeatById(tenantB, exeatA.id)).rejects.toThrow('not found');

    // Tenant B cannot approve Tenant A's exeat
    await expect(
      exeatService.approveOrRejectExeat(tenantB, exeatA.id, 'warden_b', { approved: true }),
    ).rejects.toThrow('not found');
  });

  it('should define and export hostel permissions correctly', () => {
    expect(SystemPermissions.HOSTEL_VIEW).toBe('hostel.view');
    expect(SystemPermissions.HOSTEL_MANAGE).toBe('hostel.manage');
  });
});
