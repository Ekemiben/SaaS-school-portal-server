import {
  StudentSummaryResult,
  SubjectSummaryItem,
  SubjectMatrixItem,
  ClassBroadsheetResult,
} from '../dto/academic-summary.dto.js';

export class AcademicSummaryCalculator {
  /**
   * Calculates Term GPA based on subject grade points and optional credit units.
   */
  static calculateTermGpa(
    results: Array<{ gradePoint?: number | null; creditUnit?: number }>,
  ): { gpa: number; totalCredits: number; totalPoints: number } {
    if (!results || results.length === 0) {
      return { gpa: 0, totalCredits: 0, totalPoints: 0 };
    }

    let totalPoints = 0;
    let totalCredits = 0;

    for (const res of results) {
      const credit = res.creditUnit && res.creditUnit > 0 ? res.creditUnit : 1.0;
      const gp = typeof res.gradePoint === 'number' ? res.gradePoint : 0;
      totalPoints += gp * credit;
      totalCredits += credit;
    }

    const gpa = totalCredits > 0 ? Number((totalPoints / totalCredits).toFixed(2)) : 0;
    return { gpa, totalCredits, totalPoints: Number(totalPoints.toFixed(2)) };
  }

  /**
   * Calculates Cumulative GPA (CGPA) over multiple terms or academic sessions.
   */
  static calculateCumulativeGpa(
    termRecords: Array<{ gpa: number; totalCredits?: number }>,
  ): number {
    if (!termRecords || termRecords.length === 0) return 0;

    let cumulativePoints = 0;
    let cumulativeCredits = 0;

    for (const term of termRecords) {
      const credits = term.totalCredits && term.totalCredits > 0 ? term.totalCredits : 1.0;
      cumulativePoints += term.gpa * credits;
      cumulativeCredits += credits;
    }

    return cumulativeCredits > 0
      ? Number((cumulativePoints / cumulativeCredits).toFixed(2))
      : 0;
  }

  /**
   * Derives descriptive academic standing from GPA/CGPA.
   */
  static deriveAcademicStanding(gpa: number): string {
    if (gpa >= 3.5) return 'DISTINCTION';
    if (gpa >= 3.0) return 'EXCELLENT';
    if (gpa >= 2.5) return 'GOOD_STANDING';
    if (gpa >= 2.0) return 'SATISFACTORY';
    if (gpa >= 1.0) return 'PASS';
    return 'PROBATION';
  }

  /**
   * Computes standard competition rankings (1, 2, 2, 4...) for a list of items with scores.
   */
  static computeRankings<T extends { id: string; score: number; secondaryScore?: number }>(
    items: T[],
  ): Map<string, number> {
    const ranks = new Map<string, number>();
    if (!items || items.length === 0) return ranks;

    const sorted = [...items].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.secondaryScore || 0) - (a.secondaryScore || 0);
    });

    let currentRank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && (sorted[i].score < sorted[i - 1].score || (sorted[i].secondaryScore || 0) < (sorted[i - 1].secondaryScore || 0))) {
        currentRank = i + 1;
      }
      ranks.set(sorted[i].id, currentRank);
    }

    return ranks;
  }

  /**
   * Generates comprehensive class broadsheet, computing subject rankings, class rankings, and stats.
   */
  static generateClassBroadsheet(params: {
    classId: string;
    className: string;
    examinationId: string;
    examinationName: string;
    students: Array<{ id: string; name: string; admissionNumber: string }>;
    results: Array<{
      studentId: string;
      subjectId: string;
      subjectName: string;
      subjectCode: string;
      marksObtained: number;
      maxMarks: number;
      grade?: string | null;
      gradePoint?: number | null;
    }>;
    creditUnits?: Record<string, number>;
  }): ClassBroadsheetResult {
    const { classId, className, examinationId, examinationName, students, results, creditUnits = {} } = params;

    // 1. Group results by Subject to compute subject stats & rankings
    const subjectStatsMap = new Map<
      string,
      {
        subjectName: string;
        subjectCode: string;
        scores: Array<{ studentId: string; score: number }>;
      }
    >();

    for (const r of results) {
      if (!subjectStatsMap.has(r.subjectId)) {
        subjectStatsMap.set(r.subjectId, {
          subjectName: r.subjectName,
          subjectCode: r.subjectCode,
          scores: [],
        });
      }
      subjectStatsMap.get(r.subjectId)!.scores.push({ studentId: r.studentId, score: r.marksObtained });
    }

    // Build subject rankings and summary matrix
    const subjectMatrix: SubjectMatrixItem[] = [];
    const subjectStudentRankMap = new Map<string, Map<string, number>>(); // subjectId -> (studentId -> rank)
    const subjectAggregatesMap = new Map<string, { average: number; highest: number; lowest: number }>();

    for (const [subjectId, stat] of subjectStatsMap.entries()) {
      const scores = stat.scores.map((s) => s.score);
      const totalScore = scores.reduce((sum, val) => sum + val, 0);
      const averageScore = scores.length > 0 ? Number((totalScore / scores.length).toFixed(2)) : 0;
      const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
      const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
      const passCount = scores.filter((s) => s >= 50).length;
      const failCount = scores.length - passCount;

      subjectAggregatesMap.set(subjectId, { average: averageScore, highest: highestScore, lowest: lowestScore });

      // Compute rankings in this subject
      const subjectRanks = this.computeRankings(
        stat.scores.map((s) => ({ id: s.studentId, score: s.score })),
      );
      subjectStudentRankMap.set(subjectId, subjectRanks);

      subjectMatrix.push({
        subjectId,
        subjectName: stat.subjectName,
        subjectCode: stat.subjectCode,
        averageScore,
        highestScore,
        lowestScore,
        passCount,
        failCount,
        totalStudents: scores.length,
      });
    }

    // 2. Group results by student to compute individual totals and Term GPAs
    const studentResultsMap = new Map<string, typeof results>();
    for (const r of results) {
      if (!studentResultsMap.has(r.studentId)) {
        studentResultsMap.set(r.studentId, []);
      }
      studentResultsMap.get(r.studentId)!.push(r);
    }

    const intermediateStudents: Array<{
      student: (typeof students)[0];
      totalMarks: number;
      maxMarks: number;
      percentage: number;
      gpa: number;
      subjects: SubjectSummaryItem[];
    }> = [];

    for (const student of students) {
      const sResults = studentResultsMap.get(student.id) || [];
      const totalMarks = Number(sResults.reduce((sum, r) => sum + r.marksObtained, 0).toFixed(2));
      const maxMarks = sResults.reduce((sum, r) => sum + (r.maxMarks || 100), 0);
      const percentage = maxMarks > 0 ? Number(((totalMarks / maxMarks) * 100).toFixed(2)) : 0;

      const gpaResult = this.calculateTermGpa(
        sResults.map((r) => ({
          gradePoint: r.gradePoint,
          creditUnit: creditUnits[r.subjectId] || 1.0,
        })),
      );

      const subjects: SubjectSummaryItem[] = sResults.map((r) => {
        const aggregates = subjectAggregatesMap.get(r.subjectId) || { average: 0, highest: 0, lowest: 0 };
        const subRank = subjectStudentRankMap.get(r.subjectId)?.get(student.id) || 1;
        const totalInSubject = subjectStatsMap.get(r.subjectId)?.scores.length || 1;
        const subPercentage = r.maxMarks > 0 ? Number(((r.marksObtained / r.maxMarks) * 100).toFixed(2)) : 0;

        return {
          subjectId: r.subjectId,
          subjectName: r.subjectName,
          subjectCode: r.subjectCode,
          marksObtained: r.marksObtained,
          maxMarks: r.maxMarks,
          percentage: subPercentage,
          grade: r.grade || 'N/A',
          gradePoint: r.gradePoint || 0,
          creditUnit: creditUnits[r.subjectId] || 1.0,
          subjectRank: subRank,
          totalStudents: totalInSubject,
          classAverage: aggregates.average,
          highestScore: aggregates.highest,
          lowestScore: aggregates.lowest,
        };
      });

      intermediateStudents.push({
        student,
        totalMarks,
        maxMarks,
        percentage,
        gpa: gpaResult.gpa,
        subjects,
      });
    }

    // 3. Compute overall class rankings
    const classRanks = this.computeRankings(
      intermediateStudents.map((s) => ({ id: s.student.id, score: s.totalMarks, secondaryScore: s.gpa })),
    );

    const allPercentages = intermediateStudents.map((s) => s.percentage);
    const classAvgPct = allPercentages.length > 0
      ? Number((allPercentages.reduce((a, b) => a + b, 0) / allPercentages.length).toFixed(2))
      : 0;

    const allGpas = intermediateStudents.map((s) => s.gpa);
    const classAvgGpa = allGpas.length > 0
      ? Number((allGpas.reduce((a, b) => a + b, 0) / allGpas.length).toFixed(2))
      : 0;

    const finalStudents: StudentSummaryResult[] = intermediateStudents.map((item) => ({
      studentId: item.student.id,
      studentName: item.student.name,
      admissionNumber: item.student.admissionNumber,
      classId,
      totalSubjects: item.subjects.length,
      totalMarks: item.totalMarks,
      maxMarks: item.maxMarks,
      percentage: item.percentage,
      gpa: item.gpa,
      classRank: classRanks.get(item.student.id) || 1,
      totalStudentsInClass: students.length,
      classAveragePercentage: classAvgPct,
      academicStanding: this.deriveAcademicStanding(item.gpa),
      subjects: item.subjects,
    }));

    return {
      classId,
      className,
      examinationId,
      examinationName,
      totalStudents: students.length,
      classAverageGpa: classAvgGpa,
      classAveragePercentage: classAvgPct,
      highestGpa: allGpas.length > 0 ? Math.max(...allGpas) : 0,
      lowestGpa: allGpas.length > 0 ? Math.min(...allGpas) : 0,
      students: finalStudents.sort((a, b) => a.classRank - b.classRank),
      subjectMatrix,
    };
  }
}
