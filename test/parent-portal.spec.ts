import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParentsService } from '../src/modules/parents/parents.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { NotFoundException } from '@nestjs/common';

describe('Parent Portal & Multi-Child Resolution', () => {
  let service: ParentsService;
  let prisma: PrismaService;

  const tenantId = 'tenant_parent_01';
  const userId = 'usr_parent_01';

  beforeEach(() => {
    prisma = {
      isDbConnected: true,
      memoryStore: {
        parents: new Map(),
      },
      user: {
        findUnique: vi.fn(),
      },
      parent: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      studentParent: {
        findMany: vi.fn(),
        createMany: vi.fn(),
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: tenantId,
          name: 'Apex Academy Lagos',
          currency: 'NGN',
          features: {
            paymentConfig: {
              defaultProvider: 'PAYSTACK',
              bankName: 'Access Bank',
              accountNumber: '0123456789',
              accountName: 'Apex Academy Tuition Account',
              paymentInstructions: 'Include student admission number in narration',
            },
          },
        }),
      },
    } as any;

    service = new ParentsService(prisma);
  });

  it('should resolve multiple wards for parent portal and compute aggregated attendance, fees, and school payment details', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: userId,
      email: 'john.doe.parent@example.com',
      phone: '+2348011223344',
      firstName: 'John',
      lastName: 'Doe',
    });

    const mockParentRecord = {
      id: 'par_001',
      tenantId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe.parent@example.com',
      phone: '+2348011223344',
      relationship: 'Father',
      students: [
        {
          id: 'sp_1',
          studentId: 'std_child_1',
          isPrimaryContact: true,
          student: {
            id: 'std_child_1',
            admissionNumber: 'SCH/2026/001',
            firstName: 'Alice',
            lastName: 'Doe',
            campus: { name: 'Main Campus' },
            enrollments: [{ class: { name: 'JSS 1 A' } }],
            attendance: [
              { status: 'PRESENT' },
              { status: 'PRESENT' },
              { status: 'ABSENT' },
              { status: 'PRESENT' },
            ],
            invoices: [
              { id: 'inv_1', invoiceNumber: 'INV-001', totalAmount: 150000, paidAmount: 100000, balanceAmount: 50000, status: 'PARTIAL' },
            ],
          },
        },
        {
          id: 'sp_2',
          studentId: 'std_child_2',
          isPrimaryContact: true,
          student: {
            id: 'std_child_2',
            admissionNumber: 'SCH/2026/002',
            firstName: 'Bob',
            lastName: 'Doe',
            campus: { name: 'Main Campus' },
            enrollments: [{ class: { name: 'Primary 5' } }],
            attendance: [
              { status: 'PRESENT' },
              { status: 'PRESENT' },
            ],
            invoices: [
              { id: 'inv_2', invoiceNumber: 'INV-002', totalAmount: 120000, paidAmount: 120000, balanceAmount: 0, status: 'PAID' },
            ],
          },
        },
      ],
    };

    (prisma.parent.findFirst as any).mockResolvedValue(mockParentRecord);

    const profile = await service.getPortalProfile(tenantId, userId);

    expect(profile).toBeDefined();
    expect(profile.parent.fullName).toBe('John Doe');
    expect(profile.wards.length).toBe(2);

    // Alice verification
    const alice = profile.wards.find((w: any) => w.studentId === 'std_child_1');
    expect(alice).toBeDefined();
    expect(alice.fullName).toBe('Alice Doe');
    expect(alice.className).toBe('JSS 1 A');
    expect(alice.attendance.totalDays).toBe(4);
    expect(alice.attendance.presentDays).toBe(3);
    expect(alice.attendance.percentage).toBe(75);
    expect(alice.fees.balanceDue).toBe(50000);
    expect(alice.fees.isSettled).toBe(false);

    // Bob verification
    const bob = profile.wards.find((w: any) => w.studentId === 'std_child_2');
    expect(bob).toBeDefined();
    expect(bob.fullName).toBe('Bob Doe');
    expect(bob.className).toBe('Primary 5');
    expect(bob.attendance.percentage).toBe(100);
    expect(bob.fees.balanceDue).toBe(0);
    expect(bob.fees.isSettled).toBe(true);

    // Summary verification
    expect(profile.summary.totalWards).toBe(2);
    expect(profile.summary.totalOutstanding).toBe(50000);
    expect(profile.summary.isAllSettled).toBe(false);

    // School payment details verification
    expect(profile.school).toBeDefined();
    expect(profile.school.name).toBe('Apex Academy Lagos');
    expect(profile.school.currency).toBe('NGN');
    expect(profile.school.bankDetails.bankName).toBe('Access Bank');
    expect(profile.school.bankDetails.accountNumber).toBe('0123456789');
    expect(profile.school.bankDetails.accountName).toBe('Apex Academy Tuition Account');
  });

  it('should throw NotFoundException if user is not found', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);

    await expect(service.getPortalProfile(tenantId, 'non_existent_user')).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException if parent record does not exist for the user in the specified tenant', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: userId,
      email: 'orphan.user@example.com',
    });
    (prisma.parent.findFirst as any).mockResolvedValue(null);

    await expect(service.getPortalProfile(tenantId, userId)).rejects.toThrow(NotFoundException);
  });

  it('should provision a new User record with hashed password and PARENT role when creating a parent', async () => {
    prisma.role = {
      findFirst: vi.fn().mockResolvedValue({ id: 'role_parent_123', name: 'PARENT' }),
      create: vi.fn(),
    } as any;
    prisma.user = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'usr_new_parent_123',
        ...args.data,
      })),
    } as any;
    prisma.userRole = {
      upsert: vi.fn().mockResolvedValue({ id: 'ur_123' }),
    } as any;
    (prisma.parent.create as any).mockImplementation((args) => Promise.resolve({
      id: args.data.id,
      ...args.data,
    }));
    (prisma.parent.findFirst as any).mockImplementation((args) => Promise.resolve({
      id: 'par_001',
      userId: 'usr_new_parent_123',
      tenantId,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+2348099887766',
      students: [],
    }));

    const result = await service.create(tenantId, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+2348099887766',
      password: 'SecureCustomPassword456!',
    });

    expect(result).toBeDefined();
    expect(prisma.user.create).toHaveBeenCalled();
    const createCallArgs = (prisma.user.create as any).mock.calls[0][0];
    expect(createCallArgs.data.email).toBe('jane.doe@example.com');
    expect(createCallArgs.data.passwordHash).toBeDefined();
    expect(createCallArgs.data.passwordHash).not.toBe('SecureCustomPassword456!');
    expect(createCallArgs.data.passwordHash.startsWith('$2a$') || createCallArgs.data.passwordHash.startsWith('$2b$')).toBe(true);
  });

  it('should link existing User record when email matches and add PARENT role if not present', async () => {
    prisma.role = {
      findFirst: vi.fn().mockResolvedValue({ id: 'role_parent_123', name: 'PARENT' }),
    } as any;
    prisma.user = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'usr_existing_123',
        tenantId,
        email: 'existing.parent@example.com',
      }),
      create: vi.fn(),
    } as any;
    prisma.userRole = {
      upsert: vi.fn().mockResolvedValue({ id: 'ur_123' }),
    } as any;

    const linkedUserId = await service.provisionOrLinkParentUser(tenantId, {
      firstName: 'Existing',
      lastName: 'Parent',
      email: 'existing.parent@example.com',
    });

    expect(linkedUserId).toBe('usr_existing_123');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_roleId: {
            userId: 'usr_existing_123',
            roleId: 'role_parent_123',
          },
        },
      }),
    );
  });
});
