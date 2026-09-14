import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { HomeworkModule } from '../src/modules/homework/homework.module.js';
import { HomeworkCoreService } from '../src/modules/homework/services/homework-core.service.js';
import { HomeworkSubmissionService } from '../src/modules/homework/services/homework-submission.service.js';
import { ConfigModule } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('TASK 27: Homework — Assignment Creation & Student Submissions', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let coreService: HomeworkCoreService;
  let submissionService: HomeworkSubmissionService;

  const tenantId = 'tenant_hw_01';
  const campusId = 'campus_hw_01';
  const classId = 'cls_grade10_math';
  const subjectId = 'sub_algebra_101';
  const teacherId = 'teacher_jane_doe';
  const student1Id = 'std_alice_01';
  const student2Id = 'std_bob_02';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, HomeworkModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    coreService = moduleRef.get<HomeworkCoreService>(HomeworkCoreService);
    submissionService = moduleRef.get<HomeworkSubmissionService>(HomeworkSubmissionService);

    // Setup tenant & records
    prisma.memoryStore.tenants.set(tenantId, { id: tenantId, name: 'St. Jude Academy' });
    prisma.memoryStore.campuses.set(campusId, { id: campusId, tenantId, name: 'Main Campus' });
    prisma.memoryStore.classes.set(classId, { id: classId, tenantId, campusId, name: 'Grade 10 Math A' });
    prisma.memoryStore.subjects.set(subjectId, { id: subjectId, tenantId, name: 'Advanced Algebra', code: 'MTH101' });

    prisma.memoryStore.students.set(student1Id, {
      id: student1Id,
      tenantId,
      campusId,
      classId,
      firstName: 'Alice',
      lastName: 'Morgan',
      admissionNumber: 'SCH/2026/001',
      status: 'ACTIVE',
    });

    prisma.memoryStore.students.set(student2Id, {
      id: student2Id,
      tenantId,
      campusId,
      classId,
      firstName: 'Bob',
      lastName: 'Smith',
      admissionNumber: 'SCH/2026/002',
      status: 'ACTIVE',
    });
  });

  it('should create an assignment with attachments, rubric criteria, and deadlines', async () => {
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days in future
    const homework = await coreService.createHomework(tenantId, teacherId, {
      classId,
      subjectId,
      title: 'Quadratic Equations Problem Set 1',
      description: 'Solve problems 1-15 on page 42. Show all step-by-step workings.',
      dueDate,
      maxMarks: 50,
      passingMarks: 25,
      allowLateSubmissions: true,
      latePenaltyPercent: 10,
      attachments: [
        { url: 'https://storage.saas.com/hw/quadratic_worksheet.pdf', name: 'Quadratic Worksheet.pdf', sizeBytes: 102400 },
      ],
      rubricCriteria: [
        { title: 'Methodology & Working Steps', maxPoints: 30 },
        { title: 'Accuracy of Final Solutions', maxPoints: 20 },
      ],
    });

    expect(homework.id).toBeDefined();
    expect(homework.title).toBe('Quadratic Equations Problem Set 1');
    expect(homework.maxMarks).toBe(50);
    expect(homework.passingMarks).toBe(25);
    expect(homework.className).toBe('Grade 10 Math A');
    expect(homework.subjectName).toBe('Advanced Algebra');
    expect(homework.attachments).toHaveLength(1);
    expect(homework.rubricCriteria).toHaveLength(2);
  });

  it('should allow student digital submission with text and attachment files', async () => {
    const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const homework = await coreService.createHomework(tenantId, teacherId, {
      classId,
      subjectId,
      title: 'Algebra Quiz Assignment',
      description: 'Submit your solution document',
      dueDate,
      maxMarks: 20,
    });

    const submission = await submissionService.submitHomework(tenantId, homework.id, {
      studentId: student1Id,
      submissionText: 'Here is my complete algebraic solution.',
      attachmentUrls: [
        { url: 'https://storage.saas.com/submissions/alice_sol.pdf', name: 'Alice_Solution.pdf', sizeBytes: 54000 },
      ],
    });

    expect(submission.id).toBeDefined();
    expect(submission.studentName).toBe('Alice Morgan');
    expect(submission.isLate).toBe(false);
    expect(submission.status).toBe('SUBMITTED');
    expect(submission.attachmentUrls).toHaveLength(1);

    // Verify submission retrieval
    const mySub = await submissionService.getMySubmission(tenantId, homework.id, student1Id);
    expect(mySub).not.toBeNull();
    expect(mySub?.submissionText).toBe('Here is my complete algebraic solution.');
  });

  it('should flag late submissions when submitted after the due date', async () => {
    const pastDueDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days in past
    const homework = await coreService.createHomework(tenantId, teacherId, {
      classId,
      subjectId,
      title: 'Late Permitted Assignment',
      description: 'Past due date assignment',
      dueDate: pastDueDate,
      allowLateSubmissions: true,
      latePenaltyPercent: 15,
    });

    const submission = await submissionService.submitHomework(tenantId, homework.id, {
      studentId: student2Id,
      submissionText: 'Submitting 2 days late with apologies.',
    });

    expect(submission.isLate).toBe(true);
    expect(submission.status).toBe('SUBMITTED');
  });

  it('should reject submission if deadline passed and late submissions are prohibited', async () => {
    const pastDueDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const homework = await coreService.createHomework(tenantId, teacherId, {
      classId,
      subjectId,
      title: 'Strict Deadline Quiz',
      description: 'No late submissions permitted',
      dueDate: pastDueDate,
      allowLateSubmissions: false,
    });

    await expect(
      submissionService.submitHomework(tenantId, homework.id, {
        studentId: student1Id,
        submissionText: 'Attempting late submission',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
