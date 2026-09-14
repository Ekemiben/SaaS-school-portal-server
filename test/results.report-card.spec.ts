import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { ReportCardService } from '../src/modules/results/services/report-card.service.js';
import { AcademicSummaryService } from '../src/modules/results/services/academic-summary.service.js';
import { CloudflareR2StorageProvider } from '../src/modules/files/storage.provider.js';
import { ReportCardRenderer } from '../src/modules/results/renderer/report-card-renderer.js';

describe('Report Card Generation & Batch Publishing (Task 15 - Phase 7)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let storageProvider: CloudflareR2StorageProvider;
  let academicSummaryService: AcademicSummaryService;
  let reportCardService: ReportCardService;

  const tenantA = 'tenant_rc_alpha';
  const tenantB = 'tenant_rc_beta';
  const campusA = 'campus_rc_a1';
  const examTerm1 = 'exam_term1_rc';
  const classGrade10 = 'cls_grade10_rc';
  const studentA1 = 'std_rc_01'; // Ada Obi
  const studentA2 = 'std_rc_02'; // Chidi Okafor
  const subjectMath = 'sub_math_rc';
  const subjectEng = 'sub_eng_rc';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);

    storageProvider = new CloudflareR2StorageProvider();
    storageProvider.onModuleInit();

    academicSummaryService = new AcademicSummaryService(prisma);
    reportCardService = new ReportCardService(
      prisma,
      storageProvider,
      academicSummaryService,
    );

    // Populate memory store
    prisma.memoryStore.tenants.set(tenantA, {
      id: tenantA,
      name: 'Gracefield Academy Lagos',
      slug: 'gracefield',
      primaryColor: '#1e3a8a',
      secondaryColor: '#0ea5e9',
      currency: 'NGN',
    });
    prisma.memoryStore.tenants.set(tenantB, {
      id: tenantB,
      name: 'Beacon Heights School',
      slug: 'beacon-heights',
      currency: 'NGN',
    });

    prisma.memoryStore.campuses.set(campusA, {
      id: campusA,
      tenantId: tenantA,
      name: 'Lekki Campus',
      address: '22 Admiralty Way, Lekki Phase 1, Lagos',
      phone: '+234 809 555 1234',
      email: 'lekki@gracefield.edu.ng',
    });

    prisma.memoryStore.classes.set(classGrade10, {
      id: classGrade10,
      tenantId: tenantA,
      campusId: campusA,
      name: 'Grade 10 Ruby',
      gradeLevel: 'Grade 10',
    });

    prisma.memoryStore.students.set(studentA1, {
      id: studentA1,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classGrade10,
      admissionNumber: 'GFA/2026/045',
      firstName: 'Ada',
      lastName: 'Obi',
      gender: 'Female',
    });
    prisma.memoryStore.students.set(studentA2, {
      id: studentA2,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classGrade10,
      admissionNumber: 'GFA/2026/046',
      firstName: 'Chidi',
      lastName: 'Okafor',
      gender: 'Male',
    });

    prisma.memoryStore.examinations.set(examTerm1, {
      id: examTerm1,
      tenantId: tenantA,
      name: 'First Term Examination 2026/2027',
    });

    prisma.memoryStore.subjects.set(subjectMath, {
      id: subjectMath,
      tenantId: tenantA,
      code: 'MTH101',
      name: 'Mathematics',
    });
    prisma.memoryStore.subjects.set(subjectEng, {
      id: subjectEng,
      tenantId: tenantA,
      code: 'ENG101',
      name: 'English Language',
    });

    // Populate results with continuous assessment components
    prisma.memoryStore.results.set('res_rc_a1_m', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA1, subjectId: subjectMath,
      marksObtained: 88, maxMarks: 100, grade: 'A1', gradePoint: 4.0,
      componentScores: { CA1: 18, CA2: 17, MIDTERM: 18, EXAM: 35 },
    });
    prisma.memoryStore.results.set('res_rc_a1_e', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA1, subjectId: subjectEng,
      marksObtained: 82, maxMarks: 100, grade: 'A1', gradePoint: 4.0,
      componentScores: { CA1: 16, CA2: 18, MIDTERM: 16, EXAM: 32 },
    });

    prisma.memoryStore.results.set('res_rc_a2_m', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA2, subjectId: subjectMath,
      marksObtained: 72, maxMarks: 100, grade: 'B2', gradePoint: 3.5,
      componentScores: { CA1: 14, CA2: 14, MIDTERM: 14, EXAM: 30 },
    });
    prisma.memoryStore.results.set('res_rc_a2_e', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA2, subjectId: subjectEng,
      marksObtained: 76, maxMarks: 100, grade: 'B2', gradePoint: 3.5,
      componentScores: { CA1: 15, CA2: 15, MIDTERM: 16, EXAM: 30 },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('1. Branded HTML Report Card Rendering', () => {
    it('prepares and renders branded HTML report card with all academic components', async () => {
      const data = await reportCardService.prepareReportCardData(tenantA, studentA1, examTerm1, {
        principalRemarks: 'Exemplary conduct and scholastic performance.',
        nextTermResumptionDate: 'January 12, 2027',
      });

      expect(data.school.name).toBe('Gracefield Academy Lagos');
      expect(data.student.fullName).toBe('Ada Obi');
      expect(data.student.className).toBe('Grade 10 Ruby');
      expect(data.subjects).toHaveLength(2);
      expect(data.metadata.verificationCode).toMatch(/^RC_VERIFY_[A-Z0-9]{16}$/);

      const html = ReportCardRenderer.renderHtml(data);
      expect(html).toContain('Gracefield Academy Lagos');
      expect(html).toContain('Ada Obi');
      expect(html).toContain('GFA/2026/045');
      expect(html).toContain('Mathematics');
      expect(html).toContain('A1');
      expect(html).toContain('Exemplary conduct and scholastic performance.');
      expect(html).toContain('January 12, 2027');
      expect(html).toContain('Verification Code:');
    });
  });

  describe('2. Single Student Report Card Publishing to Storage', () => {
    it('publishes single report card and generates secure presigned download link', async () => {
      const asset = await reportCardService.publishSingleReportCard(tenantA, {
        studentId: studentA1,
        examinationId: examTerm1,
        principalRemarks: 'Outstanding work.',
      });

      expect(asset.reportCardId).toBeDefined();
      expect(asset.studentId).toBe(studentA1);
      expect(asset.studentName).toBe('Ada Obi');
      expect(asset.storageKey).toBe(
        `tenants/${tenantA}/reports/report_cards/${examTerm1}/report_card_${studentA1}.html`,
      );
      expect(asset.downloadUrl).toBeDefined();
      expect(asset.publishedAt).toBeDefined();
    });
  });

  describe('3. Batch Class Report Card Publishing', () => {
    it('asynchronously batch publishes report cards for all students in a class', async () => {
      const batchResult = await reportCardService.batchPublishReportCards(
        tenantA,
        'usr_principal_01',
        {
          classId: classGrade10,
          examinationId: examTerm1,
          defaultPrincipalRemarks: 'Keep working hard.',
          nextTermResumptionDate: 'January 12, 2027',
          notifyParents: true,
        },
      );

      expect(batchResult.jobId).toMatch(/^job_batch_rc_/);
      expect(batchResult.classId).toBe(classGrade10);
      expect(batchResult.totalStudents).toBe(2);
      expect(batchResult.successCount).toBe(2);
      expect(batchResult.status).toBe('COMPLETED');
      expect(batchResult.reportCards).toHaveLength(2);

      // Verify batch status lookup
      const status = await reportCardService.getBatchPublishStatus(tenantA, batchResult.jobId);
      expect(status.jobId).toBe(batchResult.jobId);
      expect(status.successCount).toBe(2);
    });
  });

  describe('4. Multi-Tenant Security & Isolation', () => {
    it('prevents cross-tenant access to report card publishing', async () => {
      // Tenant B cannot prepare or publish report card for Tenant A student
      await expect(
        reportCardService.prepareReportCardData(tenantB, studentA1, examTerm1),
      ).rejects.toThrow();

      await expect(
        reportCardService.publishSingleReportCard(tenantB, {
          studentId: studentA1,
          examinationId: examTerm1,
        }),
      ).rejects.toThrow();
    });
  });
});
