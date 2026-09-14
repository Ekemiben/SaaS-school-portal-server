import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { HomeworkModule } from '../src/modules/homework/homework.module.js';
import { HomeworkCoreService } from '../src/modules/homework/services/homework-core.service.js';
import { HomeworkSubmissionService } from '../src/modules/homework/services/homework-submission.service.js';
import { HomeworkGradingService } from '../src/modules/homework/services/homework-grading.service.js';
import { StudyMaterialService } from '../src/modules/homework/services/study-material.service.js';
import { SyllabusService } from '../src/modules/homework/services/syllabus.service.js';
import { ConfigModule } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';

describe('TASK 27: Homework & LMS — Multi-Tenant Isolation & Security Boundaries', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let coreService: HomeworkCoreService;
  let submissionService: HomeworkSubmissionService;
  let gradingService: HomeworkGradingService;
  let materialService: StudyMaterialService;
  let syllabusService: SyllabusService;

  const tenantAlpha = 'tenant_hw_iso_alpha';
  const tenantBeta = 'tenant_hw_iso_beta';

  const campusAlpha = 'campus_hw_iso_alpha';
  const campusBeta = 'campus_hw_iso_beta';

  const classAlpha = 'cls_hw_iso_alpha';
  const classBeta = 'cls_hw_iso_beta';

  const subjectAlpha = 'sub_hw_iso_alpha';
  const subjectBeta = 'sub_hw_iso_beta';

  const studentAlpha = 'std_hw_iso_alpha';
  const studentBeta = 'std_hw_iso_beta';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, HomeworkModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    coreService = moduleRef.get<HomeworkCoreService>(HomeworkCoreService);
    submissionService = moduleRef.get<HomeworkSubmissionService>(HomeworkSubmissionService);
    gradingService = moduleRef.get<HomeworkGradingService>(HomeworkGradingService);
    materialService = moduleRef.get<StudyMaterialService>(StudyMaterialService);
    syllabusService = moduleRef.get<SyllabusService>(SyllabusService);

    // Tenant Alpha Setup
    prisma.memoryStore.tenants.set(tenantAlpha, { id: tenantAlpha, name: 'Alpha Grammar School' });
    prisma.memoryStore.campuses.set(campusAlpha, { id: campusAlpha, tenantId: tenantAlpha, name: 'Alpha Campus' });
    prisma.memoryStore.classes.set(classAlpha, { id: classAlpha, tenantId: tenantAlpha, campusId: campusAlpha, name: 'Alpha Class 10' });
    prisma.memoryStore.subjects.set(subjectAlpha, { id: subjectAlpha, tenantId: tenantAlpha, name: 'Alpha Physics', code: 'PHY10' });
    prisma.memoryStore.students.set(studentAlpha, {
      id: studentAlpha,
      tenantId: tenantAlpha,
      campusId: campusAlpha,
      classId: classAlpha,
      firstName: 'Alpha',
      lastName: 'Student',
      admissionNumber: 'SCH/A/001',
      status: 'ACTIVE',
    });

    // Tenant Beta Setup
    prisma.memoryStore.tenants.set(tenantBeta, { id: tenantBeta, name: 'Beta High School' });
    prisma.memoryStore.campuses.set(campusBeta, { id: campusBeta, tenantId: tenantBeta, name: 'Beta Campus' });
    prisma.memoryStore.classes.set(classBeta, { id: classBeta, tenantId: tenantBeta, campusId: campusBeta, name: 'Beta Class 10' });
    prisma.memoryStore.subjects.set(subjectBeta, { id: subjectBeta, tenantId: tenantBeta, name: 'Beta Physics', code: 'PHY10' });
    prisma.memoryStore.students.set(studentBeta, {
      id: studentBeta,
      tenantId: tenantBeta,
      campusId: campusBeta,
      classId: classBeta,
      firstName: 'Beta',
      lastName: 'Student',
      admissionNumber: 'SCH/B/001',
      status: 'ACTIVE',
    });
  });

  it('should prevent cross-tenant assignment creation and access', async () => {
    // Tenant Beta tries to create homework targeting Alpha class
    await expect(
      coreService.createHomework(tenantBeta, 'teacher_beta', {
        classId: classAlpha,
        subjectId: subjectBeta,
        title: 'Unauthorized Assignment',
        description: 'Cross-tenant class attempt',
        dueDate: new Date().toISOString(),
      }),
    ).rejects.toThrow(NotFoundException);

    // Alpha creates legitimate homework
    const alphaHw = await coreService.createHomework(tenantAlpha, 'teacher_alpha', {
      classId: classAlpha,
      subjectId: subjectAlpha,
      title: 'Alpha Physics Assignment',
      description: 'Optics Problem Set',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    });

    // Beta cannot fetch Alpha homework by ID
    await expect(
      coreService.getHomeworkById(tenantBeta, alphaHw.id),
    ).rejects.toThrow(NotFoundException);

    // Beta homework list returns 0 Alpha assignments
    const betaList = await coreService.getHomeworkList(tenantBeta, {});
    expect(betaList).toHaveLength(0);
  });

  it('should prevent cross-tenant submission and grading', async () => {
    const alphaHw = await coreService.createHomework(tenantAlpha, 'teacher_alpha', {
      classId: classAlpha,
      subjectId: subjectAlpha,
      title: 'Alpha Physics Assignment',
      description: 'Optics',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    });

    // Beta student attempts to submit to Alpha assignment
    await expect(
      submissionService.submitHomework(tenantBeta, alphaHw.id, {
        studentId: studentBeta,
        submissionText: 'Cross tenant submission attempt',
      }),
    ).rejects.toThrow(NotFoundException);

    // Alpha student submits legitimately
    const subAlpha = await submissionService.submitHomework(tenantAlpha, alphaHw.id, {
      studentId: studentAlpha,
      submissionText: 'Legitimate Alpha submission',
    });

    // Beta teacher attempts to grade Alpha submission
    await expect(
      gradingService.gradeSubmission(tenantBeta, subAlpha.id, 'teacher_beta', {
        score: 95,
        feedback: 'Unauthorized grading attempt',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should prevent cross-tenant study material and syllabus access', async () => {
    // Alpha creates study material & syllabus
    const matAlpha = await materialService.createStudyMaterial(tenantAlpha, 'teacher_alpha', {
      classId: classAlpha,
      subjectId: subjectAlpha,
      title: 'Alpha Ray Optics Notes',
      resourceType: 'DOCUMENT_PDF',
      fileUrl: 'https://storage.saas.com/alpha_optics.pdf',
    });

    const topicAlpha = await syllabusService.createSyllabusTopic(tenantAlpha, 'teacher_alpha', {
      classId: classAlpha,
      subjectId: subjectAlpha,
      unitNumber: 1,
      topicTitle: 'Refraction and Snell Law',
    });

    // Beta cannot access Alpha study material
    await expect(
      materialService.getStudyMaterialById(tenantBeta, matAlpha.id),
    ).rejects.toThrow(NotFoundException);

    // Beta cannot access Alpha syllabus topic
    await expect(
      syllabusService.getSyllabusTopicById(tenantBeta, topicAlpha.id),
    ).rejects.toThrow(NotFoundException);

    // Beta querying Alpha class syllabus gets NotFound
    await expect(
      syllabusService.getSyllabusTopics(tenantBeta, classAlpha, subjectAlpha),
    ).rejects.toThrow(NotFoundException);
  });
});
