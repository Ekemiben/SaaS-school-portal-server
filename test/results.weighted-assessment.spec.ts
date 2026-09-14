import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { ResultsService } from '../src/modules/results/results.service.js';
import { WeightedAssessmentCalculator } from '../src/modules/results/calculator/weighted-assessment-calculator.js';
import { BadRequestException } from '@nestjs/common';

describe('Weighted Continuous Assessment (Task 13 - Phase 7)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let resultsService: ResultsService;

  const tenantA = 'tenant_assessment_alpha';
  const tenantB = 'tenant_assessment_beta';
  const campusA = 'campus_assess_a1';
  const examA = 'exam_term1_2026';
  const studentA1 = 'std_assess_01';
  const studentA2 = 'std_assess_02';
  const subjectMath = 'sub_math_g10';
  const subjectEng = 'sub_eng_g10';
  const classGrade10 = 'cls_grade10_a';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);
    resultsService = new ResultsService(prisma);

    // Populate in-memory store for service integration
    prisma.memoryStore.tenants.set(tenantA, {
      id: tenantA,
      name: 'Alpha High School',
      slug: 'alpha-high',
      currency: 'NGN',
    });
    prisma.memoryStore.tenants.set(tenantB, {
      id: tenantB,
      name: 'Beta College',
      slug: 'beta-college',
      currency: 'NGN',
    });

    prisma.memoryStore.students.set(studentA1, {
      id: studentA1,
      tenantId: tenantA,
      campusId: campusA,
      admissionNumber: 'ALP/2026/001',
      firstName: 'Ada',
      lastName: 'Obi',
      gender: 'Female',
      currentClassId: classGrade10,
    });
    prisma.memoryStore.students.set(studentA2, {
      id: studentA2,
      tenantId: tenantA,
      campusId: campusA,
      admissionNumber: 'ALP/2026/002',
      firstName: 'Chidi',
      lastName: 'Okafor',
      gender: 'Male',
      currentClassId: classGrade10,
    });

    prisma.memoryStore.examinations.set(examA, {
      id: examA,
      tenantId: tenantA,
      name: 'First Term Unified Examination',
      examType: 'TERM_EXAM',
    });

    prisma.memoryStore.subjects.set(subjectMath, {
      id: subjectMath,
      tenantId: tenantA,
      code: 'MTH101',
      name: 'General Mathematics',
    });
    prisma.memoryStore.subjects.set(subjectEng, {
      id: subjectEng,
      tenantId: tenantA,
      code: 'ENG101',
      name: 'English Language',
    });
    prisma.memoryStore.classes.set(classGrade10, {
      id: classGrade10,
      tenantId: tenantA,
      name: 'Grade 10 Blue',
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('1. Pure Weighted Assessment Engine Calculations', () => {
    const standardComponents = [
      { code: 'CA1', name: 'Assignment 1', maxScore: 20, weight: 10 },
      { code: 'CA2', name: 'Test 2', maxScore: 20, weight: 10 },
      { code: 'MIDTERM', name: 'Mid-Term Exam', maxScore: 40, weight: 20 },
      { code: 'EXAM', name: 'Terminal Exam', maxScore: 100, weight: 60 },
    ];

    it('accurately computes 4-component continuous assessment breakdown', () => {
      // CA1: 18/20 = 9% | CA2: 16/20 = 8% | Midterm: 36/40 = 18% | Exam: 85/100 = 51% -> Total: 86.00%
      const result = WeightedAssessmentCalculator.evaluate(
        standardComponents,
        { CA1: 18, CA2: 16, MIDTERM: 36, EXAM: 85 },
      );

      expect(result.totalWeightedScore).toBe(86.0);
      expect(result.grade).toBe('A1');
      expect(result.gradePoint).toBe(4.0);
      expect(result.remarks).toBe('Distinction');
      expect(result.componentBreakdown).toHaveLength(4);
      expect(result.componentBreakdown[0].weightedScore).toBe(9.0);
      expect(result.componentBreakdown[1].weightedScore).toBe(8.0);
      expect(result.componentBreakdown[2].weightedScore).toBe(18.0);
      expect(result.componentBreakdown[3].weightedScore).toBe(51.0);
    });

    it('evaluates custom 2-component structure (CA 40% + Exam 60%)', () => {
      const components = [
        { code: 'CA', name: 'Continuous Assessment', maxScore: 40, weight: 40 },
        { code: 'EXAM', name: 'Final Exam', maxScore: 60, weight: 60 },
      ];

      const result = WeightedAssessmentCalculator.evaluate(components, { CA: 32, EXAM: 45 });
      // CA: (32/40)*40 = 32% | EXAM: (45/60)*60 = 45% -> Total: 77% (A1)
      expect(result.totalWeightedScore).toBe(77.0);
      expect(result.grade).toBe('A1');
      expect(result.gradePoint).toBe(4.0);
    });

    it('correctly assigns grades across all boundary bands (A1 to F9)', () => {
      expect(WeightedAssessmentCalculator.deriveGrade(75).grade).toBe('A1');
      expect(WeightedAssessmentCalculator.deriveGrade(72).grade).toBe('B2');
      expect(WeightedAssessmentCalculator.deriveGrade(68).grade).toBe('B3');
      expect(WeightedAssessmentCalculator.deriveGrade(62).grade).toBe('C4');
      expect(WeightedAssessmentCalculator.deriveGrade(57).grade).toBe('C5');
      expect(WeightedAssessmentCalculator.deriveGrade(52).grade).toBe('C6');
      expect(WeightedAssessmentCalculator.deriveGrade(46).grade).toBe('D7');
      expect(WeightedAssessmentCalculator.deriveGrade(41).grade).toBe('E8');
      expect(WeightedAssessmentCalculator.deriveGrade(35).grade).toBe('F9');
    });

    it('rejects component score exceeding maxScore', () => {
      expect(() => {
        WeightedAssessmentCalculator.evaluate(standardComponents, { CA1: 25, CA2: 15, MIDTERM: 30, EXAM: 70 });
      }).toThrow(BadRequestException);
    });

    it('rejects negative component score', () => {
      expect(() => {
        WeightedAssessmentCalculator.evaluate(standardComponents, { CA1: -5, CA2: 15, MIDTERM: 30, EXAM: 70 });
      }).toThrow(BadRequestException);
    });
  });

  describe('2. Assessment Structure Management', () => {
    it('creates and lists custom assessment structures for tenant', async () => {
      const struct = await resultsService.createAssessmentStructure(tenantA, {
        name: 'Senior Secondary STEM Structure',
        code: 'SS_STEM_30_70',
        components: [
          { code: 'LAB', name: 'Practical Lab Assessment', maxScore: 30, weight: 30 },
          { code: 'THEORY', name: 'Final Theory Exam', maxScore: 70, weight: 70 },
        ],
      });

      expect(struct.id).toBeDefined();
      expect(struct.name).toBe('Senior Secondary STEM Structure');
      expect(struct.totalWeight).toBe(100);

      const list = await resultsService.listAssessmentStructures(tenantA);
      expect(list.some((s: any) => s.id === struct.id)).toBe(true);
    });

    it('rejects structure creation if sum of weights != 100%', async () => {
      await expect(
        resultsService.createAssessmentStructure(tenantA, {
          name: 'Invalid Weight Structure',
          components: [
            { code: 'CA', name: 'CA', maxScore: 20, weight: 20 },
            { code: 'EXAM', name: 'Exam', maxScore: 60, weight: 60 },
          ], // Total: 80% != 100%
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Weighted Results Entry & Bulk Operations', () => {
    it('enters weighted scores for a student and records GPA and breakdown', async () => {
      const entry = await resultsService.enterWeightedScore(tenantA, 'usr_teacher_01', {
        examinationId: examA,
        studentId: studentA1,
        subjectId: subjectMath,
        classId: classGrade10,
        componentScores: { CA1: 19, CA2: 18, MIDTERM: 35, EXAM: 90 },
      });

      expect(entry.id).toBeDefined();
      expect(entry.marksObtained).toBe(90.0); // 9.5 + 9.0 + 17.5 + 54 = 90.0
      expect(entry.grade).toBe('A1');
      expect(entry.gradePoint).toBe(4.0);
      expect(entry.componentBreakdown).toHaveLength(4);
    });

    it('bulk enters weighted scores for multiple students in a subject', async () => {
      const bulkResult = await resultsService.bulkEnterWeightedScores(tenantA, 'usr_teacher_01', {
        examinationId: examA,
        subjectId: subjectEng,
        classId: classGrade10,
        entries: [
          {
            studentId: studentA1,
            componentScores: { CA1: 15, CA2: 15, MIDTERM: 30, EXAM: 70 },
          },
          {
            studentId: studentA2,
            componentScores: { CA1: 12, CA2: 10, MIDTERM: 25, EXAM: 55 },
          },
        ],
      });

      expect(bulkResult.success).toBe(true);
      expect(bulkResult.count).toBe(2);
      expect(bulkResult.results[0].marksObtained).toBe(72.0); // 7.5 + 7.5 + 15 + 42 = 72 (B2)
      expect(bulkResult.results[0].grade).toBe('B2');
      expect(bulkResult.results[1].marksObtained).toBe(56.5); // 6 + 5 + 12.5 + 33 = 56.5 (C5)
      expect(bulkResult.results[1].grade).toBe('C5');
    });
  });

  describe('4. Report Card, Printable Transcripts & GPA Aggregation', () => {
    it('generates academic summary with average GPA and PASS status', async () => {
      const report = await resultsService.getReportCard(tenantA, studentA1, examA);

      expect(report.student.id).toBe(studentA1);
      expect(report.results).toHaveLength(2); // Math (90) & English (72)
      expect(report.summary.totalSubjects).toBe(2);
      expect(report.summary.totalMarks).toBe(162.0);
      expect(report.summary.percentage).toBe(81.0);
      expect(report.summary.gpa).toBe(3.75); // (4.0 + 3.5) / 2 = 3.75
      expect(report.summary.status).toBe('PASS');
    });

    it('generates printable transcript with component breakdowns and verified format', async () => {
      const printable = await resultsService.getPrintableReportCard(tenantA, studentA1, examA);

      expect(printable.template).toBe('STANDARD_WEIGHTED_TRANSCRIPT_V1');
      expect(printable.student.fullName).toBe('Ada Obi');
      expect(printable.grades).toHaveLength(2);
      expect(printable.grades[0].componentBreakdown).toBeDefined();
      expect(printable.summary.gpa).toBe(3.75);
    });
  });

  describe('5. Approval, Publishing & Tenant Isolation', () => {
    it('approves and publishes examination results', async () => {
      const approved = await resultsService.approveResults(tenantA, examA, 'usr_principal_01');
      expect(approved.success).toBe(true);
      expect(approved.count).toBeGreaterThan(0);

      const published = await resultsService.publishResults(tenantA, examA);
      expect(published.success).toBe(true);

      const results = await resultsService.getResults(tenantA, { examinationId: examA });
      expect(results.every((r) => r.isPublished && r.isApproved)).toBe(true);
    });

    it('strictly isolates assessment structures between tenants', async () => {
      const tenantAList = await resultsService.listAssessmentStructures(tenantA);
      const tenantBList = await resultsService.listAssessmentStructures(tenantB);

      expect(tenantAList.some((s: any) => s.tenantId === tenantA)).toBe(true);
      expect(tenantBList.every((s: any) => s.tenantId === tenantB)).toBe(true);
    });
  });
});
