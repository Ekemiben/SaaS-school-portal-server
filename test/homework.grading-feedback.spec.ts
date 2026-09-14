import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { HomeworkModule } from '../src/modules/homework/homework.module.js';
import { HomeworkCoreService } from '../src/modules/homework/services/homework-core.service.js';
import { HomeworkSubmissionService } from '../src/modules/homework/services/homework-submission.service.js';
import { HomeworkGradingService } from '../src/modules/homework/services/homework-grading.service.js';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

describe('TASK 27: Homework — Teacher Grading, Feedback & Rubrics', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let coreService: HomeworkCoreService;
  let submissionService: HomeworkSubmissionService;
  let gradingService: HomeworkGradingService;

  const tenantId = 'tenant_grade_01';
  const campusId = 'campus_grade_01';
  const classId = 'cls_grade11_chem';
  const subjectId = 'sub_organic_chem';
  const teacherId = 'teacher_dr_stone';
  const student1Id = 'std_charlie_01';
  const student2Id = 'std_diana_02';

  let homeworkId: string;
  let sub1Id: string;
  let sub2Id: string;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, HomeworkModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    coreService = moduleRef.get<HomeworkCoreService>(HomeworkCoreService);
    submissionService = moduleRef.get<HomeworkSubmissionService>(HomeworkSubmissionService);
    gradingService = moduleRef.get<HomeworkGradingService>(HomeworkGradingService);

    prisma.memoryStore.tenants.set(tenantId, { id: tenantId, name: 'Science Collegiate' });
    prisma.memoryStore.campuses.set(campusId, { id: campusId, tenantId, name: 'South Campus' });
    prisma.memoryStore.classes.set(classId, { id: classId, tenantId, campusId, name: 'Grade 11 Chemistry' });
    prisma.memoryStore.subjects.set(subjectId, { id: subjectId, tenantId, name: 'Organic Chemistry', code: 'CHM201' });

    prisma.memoryStore.students.set(student1Id, {
      id: student1Id,
      tenantId,
      campusId,
      classId,
      firstName: 'Charlie',
      lastName: 'Brown',
      admissionNumber: 'SCH/2026/011',
      status: 'ACTIVE',
    });

    prisma.memoryStore.students.set(student2Id, {
      id: student2Id,
      tenantId,
      campusId,
      classId,
      firstName: 'Diana',
      lastName: 'Prince',
      admissionNumber: 'SCH/2026/012',
      status: 'ACTIVE',
    });

    const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const hw = await coreService.createHomework(tenantId, teacherId, {
      classId,
      subjectId,
      title: 'Hydrocarbons Synthesis Lab Report',
      description: 'Document laboratory observations and reaction mechanisms.',
      dueDate,
      maxMarks: 100,
    });
    homeworkId = hw.id;

    const s1 = await submissionService.submitHomework(tenantId, homeworkId, {
      studentId: student1Id,
      submissionText: 'Lab Report 1: Synthesis of Alkenes and Alkynes.',
    });
    sub1Id = s1.id;

    const s2 = await submissionService.submitHomework(tenantId, homeworkId, {
      studentId: student2Id,
      submissionText: 'Lab Report 2: Hydrocarbon Functional Groups Analysis.',
    });
    sub2Id = s2.id;
  });

  it('should grade a submission with score, derived letter grade, qualitative feedback, and rubrics', async () => {
    const graded = await gradingService.gradeSubmission(tenantId, sub1Id, teacherId, {
      score: 88,
      feedback: 'Outstanding experimental analysis and thorough reaction mechanisms.',
      rubricScores: [
        { criterionTitle: 'Experimental Methodology', pointsAwarded: 45, maxPoints: 50 },
        { criterionTitle: 'Scientific Discussion', pointsAwarded: 43, maxPoints: 50 },
      ],
    });

    expect(graded.score).toBe(88);
    expect(graded.grade).toBe('A'); // 88% -> 'A'
    expect(graded.status).toBe('GRADED');
    expect(graded.feedback).toContain('Outstanding experimental analysis');
    expect(graded.rubricScores).toHaveLength(2);
    expect(graded.gradedByUserId).toBe(teacherId);
  });

  it('should reject grading when score exceeds maxMarks or is negative', async () => {
    await expect(
      gradingService.gradeSubmission(tenantId, sub1Id, teacherId, {
        score: 115, // max is 100
        feedback: 'Score exceeding max',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      gradingService.gradeSubmission(tenantId, sub1Id, teacherId, {
        score: -5,
        feedback: 'Negative score',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should handle resubmission request and allow student resubmission', async () => {
    // Teacher requests resubmission
    const reqResub = await gradingService.gradeSubmission(tenantId, sub2Id, teacherId, {
      score: 40,
      feedback: 'Incomplete references section. Please revise and resubmit.',
      status: 'RESUBMISSION_REQUESTED',
    });

    expect(reqResub.status).toBe('RESUBMISSION_REQUESTED');

    // Student resubmits
    const resubmitted = await submissionService.resubmitHomework(tenantId, sub2Id, {
      submissionText: 'Lab Report 2: Revised with complete academic citations and bibliography.',
    });

    expect(resubmitted.status).toBe('SUBMITTED');
    expect(resubmitted.submissionText).toContain('Revised with complete academic citations');
  });

  it('should support bulk grading of multiple student submissions', async () => {
    const bulkRes = await gradingService.bulkGrade(tenantId, homeworkId, teacherId, {
      grades: [
        { submissionId: sub1Id, score: 92, feedback: 'Excellent' },
        { submissionId: sub2Id, score: 78, feedback: 'Good job' },
      ],
    });

    expect(bulkRes.count).toBe(2);
    expect(bulkRes.submissions[0].score).toBe(92);
    expect(bulkRes.submissions[0].grade).toBe('A');
    expect(bulkRes.submissions[1].score).toBe(78);
    expect(bulkRes.submissions[1].grade).toBe('B');
  });
});
