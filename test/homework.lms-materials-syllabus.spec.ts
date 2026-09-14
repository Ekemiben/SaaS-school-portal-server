import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { HomeworkModule } from '../src/modules/homework/homework.module.js';
import { StudyMaterialService } from '../src/modules/homework/services/study-material.service.js';
import { SyllabusService } from '../src/modules/homework/services/syllabus.service.js';
import { ConfigModule } from '@nestjs/config';

describe('TASK 27: LMS — Study Material Repository & Curriculum Syllabus', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let materialService: StudyMaterialService;
  let syllabusService: SyllabusService;

  const tenantId = 'tenant_lms_01';
  const campusId = 'campus_lms_01';
  const classId = 'cls_grade9_bio';
  const subjectId = 'sub_cell_biology';
  const teacherId = 'teacher_sarah_connor';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, HomeworkModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    materialService = moduleRef.get<StudyMaterialService>(StudyMaterialService);
    syllabusService = moduleRef.get<SyllabusService>(SyllabusService);

    prisma.memoryStore.tenants.set(tenantId, { id: tenantId, name: 'Apex International' });
    prisma.memoryStore.campuses.set(campusId, { id: campusId, tenantId, name: 'North Campus' });
    prisma.memoryStore.classes.set(classId, { id: classId, tenantId, campusId, name: 'Grade 9 Biology' });
    prisma.memoryStore.subjects.set(subjectId, { id: subjectId, tenantId, name: 'Cellular Biology', code: 'BIO101' });
  });

  it('should create and filter study materials across multiple resource types', async () => {
    const mat1 = await materialService.createStudyMaterial(tenantId, teacherId, {
      classId,
      subjectId,
      title: 'Cell Division & Mitosis Lecture Slides',
      description: 'Comprehensive presentation on stages of prophase to telophase.',
      topic: 'Cell Division',
      resourceType: 'PRESENTATION_PPT',
      fileUrl: 'https://storage.saas.com/materials/mitosis_slides.pptx',
      tags: ['mitosis', 'cell division', 'genetics'],
      visibilityScope: 'STUDENTS_AND_PARENTS',
    });

    const mat2 = await materialService.createStudyMaterial(tenantId, teacherId, {
      classId,
      subjectId,
      title: 'Cell Structure 3D Simulation Video',
      description: 'Educational video on organelle morphology.',
      topic: 'Organelles',
      resourceType: 'VIDEO_LINK',
      externalUrl: 'https://www.youtube.com/watch?v=cell_sim_101',
      tags: ['organelles', 'cytoplasm', 'simulation'],
      visibilityScope: 'STUDENTS_AND_PARENTS',
    });

    expect(mat1.id).toBeDefined();
    expect(mat1.className).toBe('Grade 9 Biology');
    expect(mat2.id).toBeDefined();

    // Filter by topic
    const topicFiltered = await materialService.getStudyMaterials(tenantId, { topic: 'Cell Division' });
    expect(topicFiltered).toHaveLength(1);
    expect(topicFiltered[0].title).toBe('Cell Division & Mitosis Lecture Slides');

    // Filter by search keyword
    const searchFiltered = await materialService.getStudyMaterials(tenantId, { search: 'simulation' });
    expect(searchFiltered).toHaveLength(1);
    expect(searchFiltered[0].title).toBe('Cell Structure 3D Simulation Video');
  });

  it('should track view counts and download counts on study materials', async () => {
    const mat = await materialService.createStudyMaterial(tenantId, teacherId, {
      classId,
      subjectId,
      title: 'Past Exam Papers 2024-2025',
      topic: 'Revision',
      resourceType: 'PAST_EXAM_PAPER',
      fileUrl: 'https://storage.saas.com/materials/past_papers.pdf',
    });

    // View material 2 times
    await materialService.getStudyMaterialById(tenantId, mat.id, true);
    const viewed = await materialService.getStudyMaterialById(tenantId, mat.id, true);
    expect(viewed.viewCount).toBe(2);

    // Download material
    const dl = await materialService.recordDownload(tenantId, mat.id);
    expect(dl.downloadCount).toBe(1);
    expect(dl.fileUrl).toBe('https://storage.saas.com/materials/past_papers.pdf');
  });

  it('should create curriculum syllabus topics and track completion percentage', async () => {
    const topic1 = await syllabusService.createSyllabusTopic(tenantId, teacherId, {
      classId,
      subjectId,
      unitNumber: 1,
      topicTitle: 'Introduction to Cell Theory',
      description: 'Hooke, Schleiden, and Schwann foundational principles.',
      learningObjectives: ['Define cell theory principles', 'Identify prokaryotic vs eukaryotic cells'],
      estimatedHours: 4,
      weekNumber: 1,
      orderIndex: 1,
    });

    const topic2 = await syllabusService.createSyllabusTopic(tenantId, teacherId, {
      classId,
      subjectId,
      unitNumber: 1,
      topicTitle: 'Plasma Membrane & Transport Mechanisms',
      description: 'Diffusion, osmosis, and active transport across lipid bilayers.',
      learningObjectives: ['Explain phospholipid bilayer', 'Differentiate active vs passive transport'],
      estimatedHours: 6,
      weekNumber: 2,
      orderIndex: 2,
    });

    expect(topic1.id).toBeDefined();
    expect(topic2.id).toBeDefined();

    // Check initial progress
    let syllabus = await syllabusService.getSyllabusTopics(tenantId, classId, subjectId);
    expect(syllabus.totalTopics).toBe(2);
    expect(syllabus.completedTopics).toBe(0);
    expect(syllabus.completionPercentage).toBe(0);

    // Complete topic 1
    await syllabusService.completeSyllabusTopic(tenantId, topic1.id, teacherId, {
      notes: 'Covered in Week 1 lab practical session.',
    });

    // Check updated progress
    syllabus = await syllabusService.getSyllabusTopics(tenantId, classId, subjectId);
    expect(syllabus.completedTopics).toBe(1);
    expect(syllabus.completionPercentage).toBe(50);
  });
});
