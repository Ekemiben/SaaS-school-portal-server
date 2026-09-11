import { describe, it, expect, beforeEach } from 'vitest';
import { AcademicsService } from './academics.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('AcademicsService Enrollments and Promotion', () => {
  let academicsService: AcademicsService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = new PrismaService();
    academicsService = new AcademicsService(prisma);
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
    // Create next grade class
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
    const student = prisma.memoryStore.students.get('std_john_doe_01');
    expect(student.currentClassId).toBe(nextClass.id);
  });
});
