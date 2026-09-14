import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { AcademicSummaryService } from '../src/modules/results/services/academic-summary.service.js';
import { AcademicSummaryCalculator } from '../src/modules/results/calculator/academic-summary-calculator.js';

describe('GPA & Academic Summary (Task 14 - Phase 7)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let summaryService: AcademicSummaryService;

  const tenantA = 'tenant_academic_alpha';
  const tenantB = 'tenant_academic_beta';
  const campusA = 'campus_academic_a1';
  const examTerm1 = 'exam_term1_summary';
  const examTerm2 = 'exam_term2_summary';
  const studentA1 = 'std_gpa_01'; // Ada
  const studentA2 = 'std_gpa_02'; // Chidi
  const studentA3 = 'std_gpa_03'; // Ngozi
  const classGrade10 = 'cls_grade10_summary';
  const subjectMath = 'sub_math_gpa';
  const subjectEng = 'sub_eng_gpa';
  const subjectPhys = 'sub_phys_gpa';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);
    summaryService = new AcademicSummaryService(prisma);

    // Populate memory store
    prisma.memoryStore.tenants.set(tenantA, {
      id: tenantA,
      name: 'Premier International College',
      slug: 'premier-college',
      currency: 'NGN',
    });
    prisma.memoryStore.tenants.set(tenantB, {
      id: tenantB,
      name: 'Starlight Academy',
      slug: 'starlight',
      currency: 'NGN',
    });

    prisma.memoryStore.classes.set(classGrade10, {
      id: classGrade10,
      tenantId: tenantA,
      name: 'Grade 10 Emerald',
    });

    prisma.memoryStore.students.set(studentA1, {
      id: studentA1,
      tenantId: tenantA,
      currentClassId: classGrade10,
      admissionNumber: 'PIC/2026/010',
      firstName: 'Ada',
      lastName: 'Obi',
    });
    prisma.memoryStore.students.set(studentA2, {
      id: studentA2,
      tenantId: tenantA,
      currentClassId: classGrade10,
      admissionNumber: 'PIC/2026/011',
      firstName: 'Chidi',
      lastName: 'Okafor',
    });
    prisma.memoryStore.students.set(studentA3, {
      id: studentA3,
      tenantId: tenantA,
      currentClassId: classGrade10,
      admissionNumber: 'PIC/2026/012',
      firstName: 'Ngozi',
      lastName: 'Eze',
    });

    prisma.memoryStore.examinations.set(examTerm1, {
      id: examTerm1,
      tenantId: tenantA,
      name: 'First Term Examination 2026',
    });
    prisma.memoryStore.examinations.set(examTerm2, {
      id: examTerm2,
      tenantId: tenantA,
      name: 'Second Term Examination 2027',
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
    prisma.memoryStore.subjects.set(subjectPhys, {
      id: subjectPhys,
      tenantId: tenantA,
      code: 'PHY101',
      name: 'Physics',
    });

    // Populate Term 1 results for 3 students
    // Ada: Math 90 (4.0), Eng 80 (4.0), Phys 85 (4.0) -> Total: 255/300 (85%), GPA: 4.00
    prisma.memoryStore.results.set('res_a1_m1', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA1, subjectId: subjectMath,
      marksObtained: 90, maxMarks: 100, grade: 'A1', gradePoint: 4.0,
    });
    prisma.memoryStore.results.set('res_a1_e1', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA1, subjectId: subjectEng,
      marksObtained: 80, maxMarks: 100, grade: 'A1', gradePoint: 4.0,
    });
    prisma.memoryStore.results.set('res_a1_p1', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA1, subjectId: subjectPhys,
      marksObtained: 85, maxMarks: 100, grade: 'A1', gradePoint: 4.0,
    });

    // Chidi: Math 70 (3.5), Eng 72 (3.5), Phys 68 (3.0) -> Total: 210/300 (70%), GPA: 3.33
    prisma.memoryStore.results.set('res_a2_m1', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA2, subjectId: subjectMath,
      marksObtained: 70, maxMarks: 100, grade: 'B2', gradePoint: 3.5,
    });
    prisma.memoryStore.results.set('res_a2_e1', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA2, subjectId: subjectEng,
      marksObtained: 72, maxMarks: 100, grade: 'B2', gradePoint: 3.5,
    });
    prisma.memoryStore.results.set('res_a2_p1', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA2, subjectId: subjectPhys,
      marksObtained: 68, maxMarks: 100, grade: 'B3', gradePoint: 3.0,
    });

    // Ngozi: Math 70 (3.5), Eng 72 (3.5), Phys 68 (3.0) -> Total: 210/300 (70%), GPA: 3.33 (Tied with Chidi)
    prisma.memoryStore.results.set('res_a3_m1', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA3, subjectId: subjectMath,
      marksObtained: 70, maxMarks: 100, grade: 'B2', gradePoint: 3.5,
    });
    prisma.memoryStore.results.set('res_a3_e1', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA3, subjectId: subjectEng,
      marksObtained: 72, maxMarks: 100, grade: 'B2', gradePoint: 3.5,
    });
    prisma.memoryStore.results.set('res_a3_p1', {
      tenantId: tenantA, examinationId: examTerm1, studentId: studentA3, subjectId: subjectPhys,
      marksObtained: 68, maxMarks: 100, grade: 'B3', gradePoint: 3.0,
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('1. Pure GPA & Academic Summary Engine Calculations', () => {
    it('calculates Term GPA with weighted credit units', () => {
      // Math (4 units, GPA 4.0), English (3 units, GPA 3.5), Physics (3 units, GPA 3.0)
      // Total Points = 4*4.0 + 3*3.5 + 3*3.0 = 16 + 10.5 + 9 = 35.5
      // Total Credits = 10
      // GPA = 35.5 / 10 = 3.55
      const res = AcademicSummaryCalculator.calculateTermGpa([
        { gradePoint: 4.0, creditUnit: 4 },
        { gradePoint: 3.5, creditUnit: 3 },
        { gradePoint: 3.0, creditUnit: 3 },
      ]);

      expect(res.gpa).toBe(3.55);
      expect(res.totalCredits).toBe(10);
      expect(res.totalPoints).toBe(35.5);
    });

    it('calculates Cumulative GPA (CGPA) over multiple terms', () => {
      // Term 1: GPA 3.6 (10 credits) -> 36 points
      // Term 2: GPA 3.8 (10 credits) -> 38 points
      // Term 3: GPA 4.0 (10 credits) -> 40 points
      // CGPA = (36 + 38 + 40) / 30 = 114 / 30 = 3.80
      const cgpa = AcademicSummaryCalculator.calculateCumulativeGpa([
        { gpa: 3.6, totalCredits: 10 },
        { gpa: 3.8, totalCredits: 10 },
        { gpa: 4.0, totalCredits: 10 },
      ]);

      expect(cgpa).toBe(3.8);
    });

    it('correctly maps academic standings based on thresholds', () => {
      expect(AcademicSummaryCalculator.deriveAcademicStanding(3.8)).toBe('DISTINCTION');
      expect(AcademicSummaryCalculator.deriveAcademicStanding(3.2)).toBe('EXCELLENT');
      expect(AcademicSummaryCalculator.deriveAcademicStanding(2.7)).toBe('GOOD_STANDING');
      expect(AcademicSummaryCalculator.deriveAcademicStanding(2.1)).toBe('SATISFACTORY');
      expect(AcademicSummaryCalculator.deriveAcademicStanding(1.5)).toBe('PASS');
      expect(AcademicSummaryCalculator.deriveAcademicStanding(0.8)).toBe('PROBATION');
    });

    it('computes standard competition ranking with tie handling', () => {
      const items = [
        { id: 'student_1', score: 280 },
        { id: 'student_2', score: 250 },
        { id: 'student_3', score: 250 },
        { id: 'student_4', score: 220 },
      ];

      const ranks = AcademicSummaryCalculator.computeRankings(items);
      expect(ranks.get('student_1')).toBe(1);
      expect(ranks.get('student_2')).toBe(2);
      expect(ranks.get('student_3')).toBe(2); // Tied for 2nd
      expect(ranks.get('student_4')).toBe(4); // Next rank is 4th (not 3rd)
    });
  });

  describe('2. Class Broadsheet & Class-wide Academic Aggregations', () => {
    it('generates class broadsheet with student rankings, GPAs, and subject matrix', async () => {
      const broadsheet = await summaryService.calculateClassSummaries(tenantA, {
        classId: classGrade10,
        examinationId: examTerm1,
      });

      expect(broadsheet.classId).toBe(classGrade10);
      expect(broadsheet.totalStudents).toBe(3);
      expect(broadsheet.students).toHaveLength(3);

      // Ada should be Rank 1
      const ada = broadsheet.students.find((s) => s.studentId === studentA1)!;
      expect(ada.classRank).toBe(1);
      expect(ada.gpa).toBe(4.0);
      expect(ada.percentage).toBe(85.0);
      expect(ada.academicStanding).toBe('DISTINCTION');

      // Chidi & Ngozi should both be Rank 2
      const chidi = broadsheet.students.find((s) => s.studentId === studentA2)!;
      const ngozi = broadsheet.students.find((s) => s.studentId === studentA3)!;
      expect(chidi.classRank).toBe(2);
      expect(ngozi.classRank).toBe(2);
      expect(chidi.gpa).toBe(3.33);
      expect(chidi.academicStanding).toBe('EXCELLENT');

      // Subject matrix verification
      expect(broadsheet.subjectMatrix).toHaveLength(3);
      const mathMatrix = broadsheet.subjectMatrix.find((m) => m.subjectId === subjectMath)!;
      expect(mathMatrix.highestScore).toBe(90);
      expect(mathMatrix.lowestScore).toBe(70);
      expect(mathMatrix.passCount).toBe(3);
      expect(mathMatrix.failCount).toBe(0);

      // Class average stats
      expect(broadsheet.classAveragePercentage).toBe(75.0); // (85 + 70 + 70) / 3 = 75.0
      expect(broadsheet.highestGpa).toBe(4.0);
    });
  });

  describe('3. Multi-Term History, CGPA Tracking & Official Transcript', () => {
    beforeAll(() => {
      // Add Term 2 results for Ada: Math 95 (4.0), Eng 85 (4.0), Phys 90 (4.0) -> Total: 270/300 (90%), GPA: 4.0
      prisma.memoryStore.results.set('res_a1_m2', {
        tenantId: tenantA, examinationId: examTerm2, studentId: studentA1, subjectId: subjectMath,
        marksObtained: 95, maxMarks: 100, grade: 'A1', gradePoint: 4.0,
      });
      prisma.memoryStore.results.set('res_a1_e2', {
        tenantId: tenantA, examinationId: examTerm2, studentId: studentA1, subjectId: subjectEng,
        marksObtained: 85, maxMarks: 100, grade: 'A1', gradePoint: 4.0,
      });
      prisma.memoryStore.results.set('res_a1_p2', {
        tenantId: tenantA, examinationId: examTerm2, studentId: studentA1, subjectId: subjectPhys,
        marksObtained: 90, maxMarks: 100, grade: 'A1', gradePoint: 4.0,
      });
    });

    it('tracks student academic history and computes progressive CGPA across terms', async () => {
      // Calculate Term 2 summaries
      await summaryService.calculateClassSummaries(tenantA, {
        classId: classGrade10,
        examinationId: examTerm2,
      });

      const history = await summaryService.getStudentAcademicHistory(tenantA, studentA1);
      expect(history.student.fullName).toBe('Ada Obi');
      expect(history.totalTermsRecorded).toBe(2);
      expect(history.cumulativeGpa).toBe(4.0);
      expect(history.academicStanding).toBe('DISTINCTION');
      expect(history.history).toHaveLength(2);
      expect(history.history[0].percentage).toBe(85.0);
      expect(history.history[1].percentage).toBe(90.0);
    });

    it('generates official academic transcript with verification code', async () => {
      const transcript = await summaryService.getStudentTranscript(tenantA, studentA1);

      expect(transcript.institution.name).toBe('Premier International College');
      expect(transcript.student.admissionNumber).toBe('PIC/2026/010');
      expect(transcript.overallCgpa).toBe(4.0);
      expect(transcript.overallStanding).toBe('DISTINCTION');
      expect(transcript.terms).toHaveLength(2);
      expect(transcript.validationCode).toMatch(/^TRN_[A-Z0-9]{16}$/);
      expect(transcript.issuedAt).toBeDefined();
    });
  });

  describe('4. Tenant Security & Isolation', () => {
    it('isolates academic summaries between tenants', async () => {
      const tenantASummaries = Array.from(prisma.memoryStore.academicSummaries.values()).filter(
        (s: any) => s.tenantId === tenantA,
      );
      const tenantBSummaries = Array.from(prisma.memoryStore.academicSummaries.values()).filter(
        (s: any) => s.tenantId === tenantB,
      );

      expect(tenantASummaries.length).toBeGreaterThan(0);
      expect(tenantBSummaries.length).toBe(0);

      // Tenant B cannot access student from Tenant A
      await expect(
        summaryService.getStudentAcademicHistory(tenantB, studentA1),
      ).rejects.toThrow();
    });
  });
});
