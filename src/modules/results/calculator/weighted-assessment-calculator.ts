import { BadRequestException } from '@nestjs/common';
import { AssessmentComponentDto, GradingRuleDto } from '../dto/assessment.dto.js';

export interface ComponentBreakdownItem {
  code: string;
  name: string;
  rawScore: number;
  maxScore: number;
  weight: number;
  weightedScore: number;
  percentage: number;
}

export interface WeightedEvaluationResult {
  componentBreakdown: ComponentBreakdownItem[];
  totalWeightedScore: number;
  maxMarks: number;
  grade: string;
  gradePoint: number;
  remarks: string;
}

export const DEFAULT_GRADING_RULES: GradingRuleDto[] = [
  { grade: 'A1', minScore: 75, maxScore: 100, gradePoint: 4.0, remark: 'Distinction' },
  { grade: 'B2', minScore: 70, maxScore: 74.99, gradePoint: 3.5, remark: 'Very Good' },
  { grade: 'B3', minScore: 65, maxScore: 69.99, gradePoint: 3.0, remark: 'Good' },
  { grade: 'C4', minScore: 60, maxScore: 64.99, gradePoint: 2.5, remark: 'Credit' },
  { grade: 'C5', minScore: 55, maxScore: 59.99, gradePoint: 2.0, remark: 'Credit' },
  { grade: 'C6', minScore: 50, maxScore: 54.99, gradePoint: 1.5, remark: 'Credit' },
  { grade: 'D7', minScore: 45, maxScore: 49.99, gradePoint: 1.0, remark: 'Pass' },
  { grade: 'E8', minScore: 40, maxScore: 44.99, gradePoint: 0.5, remark: 'Pass' },
  { grade: 'F9', minScore: 0, maxScore: 39.99, gradePoint: 0.0, remark: 'Fail' },
];

export class WeightedAssessmentCalculator {
  /**
   * Evaluates continuous assessment component scores according to assessment structure weights
   * and maps the aggregate score to letter grade and GPA.
   */
  static evaluate(
    components: AssessmentComponentDto[],
    componentScores: Record<string, number>,
    gradingRules: GradingRuleDto[] = DEFAULT_GRADING_RULES,
  ): WeightedEvaluationResult {
    if (!components || components.length === 0) {
      throw new BadRequestException('Assessment structure must define at least one component');
    }

    const breakdown: ComponentBreakdownItem[] = [];
    let cumulativeWeightedScore = 0;

    for (const comp of components) {
      if (comp.maxScore <= 0) {
        throw new BadRequestException(`Component ${comp.code} has invalid maxScore ${comp.maxScore}`);
      }

      const rawScore = componentScores[comp.code] ?? componentScores[comp.code.toUpperCase()] ?? 0;

      if (typeof rawScore !== 'number' || isNaN(rawScore)) {
        throw new BadRequestException(`Score for component ${comp.code} must be a valid number`);
      }

      if (rawScore < 0) {
        throw new BadRequestException(
          `Score for component ${comp.name} (${comp.code}) cannot be negative: ${rawScore}`,
        );
      }

      if (rawScore > comp.maxScore) {
        throw new BadRequestException(
          `Component '${comp.name}' (${comp.code}) score ${rawScore} exceeds maximum allowed ${comp.maxScore}`,
        );
      }

      const weightedContribution = Number(((rawScore / comp.maxScore) * comp.weight).toFixed(2));
      const percentage = Number(((rawScore / comp.maxScore) * 100).toFixed(2));

      cumulativeWeightedScore += weightedContribution;
      breakdown.push({
        code: comp.code,
        name: comp.name,
        rawScore,
        maxScore: comp.maxScore,
        weight: comp.weight,
        weightedScore: weightedContribution,
        percentage,
      });
    }

    const totalWeightedScore = Number(cumulativeWeightedScore.toFixed(2));
    const gradeInfo = this.deriveGrade(totalWeightedScore, gradingRules);

    return {
      componentBreakdown: breakdown,
      totalWeightedScore,
      maxMarks: 100,
      grade: gradeInfo.grade,
      gradePoint: gradeInfo.gradePoint,
      remarks: gradeInfo.remark || 'Satisfactory',
    };
  }

  /**
   * Derives grade, GPA, and remark from total weighted score based on grading scale rules.
   */
  static deriveGrade(
    score: number,
    rules: GradingRuleDto[] = DEFAULT_GRADING_RULES,
  ): { grade: string; gradePoint: number; remark: string } {
    if (!rules || rules.length === 0) {
      rules = DEFAULT_GRADING_RULES;
    }

    // Match rule where minScore <= score <= maxScore (or score >= minScore if ordered descending)
    for (const rule of rules) {
      if (score >= rule.minScore && score <= (rule.maxScore + 0.001)) {
        return {
          grade: rule.grade,
          gradePoint: rule.gradePoint,
          remark: rule.remark || '',
        };
      }
    }

    // Fallback if score exceeds highest maxScore
    const highest = rules.reduce((prev, curr) => (curr.maxScore > prev.maxScore ? curr : prev), rules[0]);
    if (score >= highest.maxScore) {
      return { grade: highest.grade, gradePoint: highest.gradePoint, remark: highest.remark || '' };
    }

    // Fallback to lowest rule
    const lowest = rules.reduce((prev, curr) => (curr.minScore < prev.minScore ? curr : prev), rules[0]);
    return {
      grade: lowest.grade,
      gradePoint: lowest.gradePoint,
      remark: lowest.remark || 'Fail',
    };
  }
}
