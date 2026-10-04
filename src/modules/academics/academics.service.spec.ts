import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AcademicsService } from './academics.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('AcademicsService Enrollments and Promotion', () => {
  let academicsService: AcademicsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      student: {
        findFirst: vi.fn().mockResolvedValue({ id: 'std_john_doe_01', tenantId: 'tenant_greenfield_100' }),
      },
      class: {
        findFirst: vi.fn().mockResolvedValue({ id: 'cls_grade10_a', tenantId: 'tenant_greenfield_100' }),
        create: vi.fn().mockResolvedValue({
          id: 'cls_grade11_gold',
          tenantId: 'tenant_greenfield_100',
          campusId: 'campus_main_01',
          academicYearId: 'ay_2026_2027',
          name: 'Grade 11 Gold',
          gradeLevel: 'Grade 11',
          stream: 'Gold',
          capacity: 35,
        }),
      },
      campus: {
        findFirst: vi.fn().mockResolvedValue({ id: 'campus_main_01', tenantId: 'tenant_greenfield_100' }),
      },
      academicYear: {
        findFirst: vi.fn().mockResolvedValue({ id: 'ay_2026_2027', tenantId: 'tenant_greenfield_100' }),
      },
      enrollment: {
        create: vi.fn().mockResolvedValue({
          id: 'enr_123',
          tenantId: 'tenant_greenfield_100',
          studentId: 'std_john_doe_01',
          classId: 'cls_grade10_a',
          academicYearId: 'ay_2026_2027',
          status: 'ACTIVE',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      classSubject: {
        upsert: vi.fn().mockResolvedValue({
          id: 'cs_123',
          classId: 'cls_grade10_a',
          subjectId: 'sub_math_101',
          teacherId: 'tch_001',
        }),
      },
      teacher: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    academicsService = new AcademicsService(mockPrisma as any);
  });

  it('should enroll students into a class and assign subjects', async () => {
    const enrollment = await academicsService.enrollStudent('tenant_greenfield_100', {
      studentId: 'std_john_doe_01',
      classId: 'cls_grade10_a',
      academicYearId: 'ay_2026_2027',
    });

    expect(enrollment.id).toBeDefined();

    const subjectAssignment = await academicsService.assignClassSubject('tenant_greenfield_100', {
      classId: 'cls_grade10_a',
      subjectId: 'sub_math_101',
      teacherId: 'tch_001',
    });

    expect(subjectAssignment.id).toBeDefined();
  });

  it('should promote students from one class to another', async () => {
    const nextClass = await academicsService.createClass('tenant_greenfield_100', {
      campusId: 'campus_main_01',
      academicYearId: 'ay_2026_2027',
      name: 'Grade 11 Gold',
      gradeLevel: 'Grade 11',
      stream: 'Gold',
      capacity: 35,
    });

    const promotion = await academicsService.promoteStudents('tenant_greenfield_100', {
      fromClassId: 'cls_grade10_a',
      toClassId: nextClass.id,
      studentIds: ['std_john_doe_01'],
      targetAcademicYearId: 'ay_2026_2027',
    });

    expect(promotion.promotedCount).toBe(1);
    expect(promotion.success).toBe(true);
  });
});
