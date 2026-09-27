import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExaminationsService } from '../src/modules/examinations/examinations.service.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('ExaminationsService', () => {
  let service: ExaminationsService;
  let prisma: PrismaService;

  const mockTenantId = 'tenant_test_123';

  beforeEach(() => {
    prisma = {
      isDbConnected: false,
      memoryStore: {
        examinations: new Map(),
        gradingScales: new Map(),
      },
      examination: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      examSchedule: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      gradingScale: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      student: {
        count: vi.fn().mockResolvedValue(150),
      },
    } as any;

    service = new ExaminationsService(prisma);
  });

  describe('create and findAll', () => {
    it('should create an exam series in memoryStore when DB is disconnected and list it', async () => {
      const examData = {
        title: 'Mid-Term Exam 2026',
        examType: 'Mid-Term',
        startDate: '2026-10-01',
        endDate: '2026-10-15',
        registeredCandidates: 250,
      };

      const created = await service.create(mockTenantId, examData);
      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.title).toBe('Mid-Term Exam 2026');
      expect(created.tenantId).toBe(mockTenantId);

      const all = await service.findAll(mockTenantId);
      expect(all.length).toBe(1);
      expect(all[0].id).toBe(created.id);
      expect(all[0].registeredCandidates).toBe(250);
    });

    it('should isolate examinations across tenants', async () => {
      await service.create('tenant_A', { title: 'Exam A' });
      await service.create('tenant_B', { title: 'Exam B' });

      const tenantAExams = await service.findAll('tenant_A');
      const tenantBExams = await service.findAll('tenant_B');

      expect(tenantAExams.length).toBe(1);
      expect(tenantAExams[0].title).toBe('Exam A');

      expect(tenantBExams.length).toBe(1);
      expect(tenantBExams[0].title).toBe('Exam B');
    });
  });

  describe('PostgreSQL integration', () => {
    it('should query Prisma PostgreSQL when DB is connected and compute candidate count dynamically', async () => {
      prisma.isDbConnected = true;

      const mockExam = {
        id: 'exam_pg_001',
        tenantId: mockTenantId,
        campusId: 'campus_01',
        name: 'Final Term Exam',
        examType: 'TERM_EXAM',
        startDate: new Date('2026-12-01'),
        endDate: new Date('2026-12-15'),
        isPublished: true,
        academicYear: { name: '2026/2027' },
        term: { name: 'First Term' },
        campus: { name: 'Main Campus' },
        schedules: [
          {
            id: 'sched_01',
            examinationId: 'exam_pg_001',
            subjectId: 'sub_math',
            classId: 'class_jss1',
            examDate: new Date('2026-12-05'),
            startTime: '09:00 AM',
            endTime: '11:00 AM',
            maxMarks: 100,
            passMarks: 50,
            subject: { name: 'Mathematics', code: 'MTH101' },
            class: { name: 'JSS 1 A' },
          },
        ],
        createdAt: new Date(),
      };

      (prisma.examination.findMany as any).mockResolvedValue([mockExam]);

      const results = await service.findAll(mockTenantId);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Final Term Exam');
      expect(results[0].registeredCandidates).toBe(150);
      expect(results[0].papersCount).toBe(1);
      expect(results[0].papers[0].subject).toBe('Mathematics');
      expect(results[0].papers[0].paperCode).toBe('MTH101');
    });
  });

  describe('Grading scale management', () => {
    it('should create and retrieve grading scales', async () => {
      const scaleData = {
        name: 'WAEC Standard Scale',
        grades: [
          { grade: 'A1', minScore: 75, maxScore: 100, remark: 'Excellent' },
          { grade: 'B2', minScore: 70, maxScore: 74, remark: 'Very Good' },
          { grade: 'C4', minScore: 60, maxScore: 64, remark: 'Credit' },
          { grade: 'F9', minScore: 0, maxScore: 39, remark: 'Fail' },
        ],
      };

      const created = await service.createGradingScale(mockTenantId, scaleData);
      expect(created).toBeDefined();
      expect(created.name).toBe('WAEC Standard Scale');

      const scales = await service.getGradingScales(mockTenantId);
      expect(scales.length).toBeGreaterThanOrEqual(1);
      const found = scales.find((s: any) => s.name === 'WAEC Standard Scale');
      expect(found).toBeDefined();
    });
  });
});
