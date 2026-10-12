import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { StudentsService } from './students.service';
import { PrismaService } from '../../database/prisma.service.js';

describe('StudentsService - Demographic & Image Extensions', () => {
  let service: StudentsService;
  let prisma: PrismaService;

  const mockPrisma = {
    student: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    parent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    campus: {
      findFirst: vi.fn().mockResolvedValue({ id: 'campus-1' }),
    },
    academicYear: {
      findFirst: vi.fn().mockResolvedValue({ id: 'ay-1' }),
    },
    enrollment: {
      create: vi.fn().mockResolvedValue({ id: 'enr-1' }),
    },
    class: {
      findFirst: vi.fn().mockResolvedValue({ id: 'class-1', name: 'JSS 1' }),
    },
    studentParent: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should pass demographic and origin fields when creating a student', async () => {
    const studentData: any = {
      firstName: 'Chidinma',
      lastName: 'Okafor',
      admissionNumber: 'ADM-2026-001',
      dateOfBirth: '2012-05-14',
      gender: 'Female',
      classId: 'class-1',
      stateOfOrigin: 'Anambra',
      lgaOfOrigin: 'Nnewi North',
      nationality: 'Nigerian',
      religion: 'Christianity',
      address: '12 Awolowo Way',
      city: 'Ikeja',
      stateOfResidence: 'Lagos',
      emergencyContactName: 'Chief Okafor',
      emergencyContactPhone: '+2348030001122',
      emergencyContactRelationship: 'Father',
      genotype: 'AA',
      allergies: 'None',
      medicalConditions: 'None',
      previousSchool: 'Premier Heights Academy',
    };

    mockPrisma.student.create.mockResolvedValue({
      id: 'student-123',
      tenantId: 'tenant-1',
      ...studentData,
      enrollmentStatus: 'ENROLLED',
    });

    const result = await service.create('tenant-1', studentData);

    expect(mockPrisma.student.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stateOfOrigin: 'Anambra',
          lgaOfOrigin: 'Nnewi North',
          city: 'Ikeja',
          stateOfResidence: 'Lagos',
          genotype: 'AA',
        }),
      }),
    );
    expect(result.id).toBe('student-123');
  });

  it('should pass updated photoUrl and medical details when updating a student', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      id: 'student-123',
      tenantId: 'tenant-1',
    });

    mockPrisma.student.update.mockResolvedValue({
      id: 'student-123',
      tenantId: 'tenant-1',
      photoUrl: '/uploads/tenants/tenant-1/students/passport.png',
      allergies: 'Peanuts',
    });

    const result = await service.update('tenant-1', 'student-123', {
      photoUrl: '/uploads/tenants/tenant-1/students/passport.png',
      allergies: 'Peanuts',
    } as any);

    expect(mockPrisma.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'student-123' },
        data: expect.objectContaining({
          photoUrl: '/uploads/tenants/tenant-1/students/passport.png',
          allergies: 'Peanuts',
        }),
      }),
    );
    expect(result.photoUrl).toBe('/uploads/tenants/tenant-1/students/passport.png');
  });
});
