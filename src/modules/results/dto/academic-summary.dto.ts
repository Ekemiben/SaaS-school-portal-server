import { IsString, IsOptional, IsObject } from 'class-validator';

export class CalculateClassSummariesDto {
  @IsString()
  classId!: string;

  @IsString()
  examinationId!: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  termId?: string;

  @IsOptional()
  @IsObject()
  creditUnits?: Record<string, number>; // Map of subjectId -> credit unit weight (default 1.0)
}

export interface SubjectSummaryItem {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
  grade: string;
  gradePoint: number;
  creditUnit: number;
  subjectRank: number;
  totalStudents: number;
  classAverage: number;
  highestScore: number;
  lowestScore: number;
}

export interface StudentSummaryResult {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  classId: string;
  totalSubjects: number;
  totalMarks: number;
  maxMarks: number;
  percentage: number;
  gpa: number;
  cgpa?: number;
  classRank: number;
  totalStudentsInClass: number;
  classAveragePercentage: number;
  academicStanding: string;
  subjects: SubjectSummaryItem[];
}

export interface SubjectMatrixItem {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passCount: number;
  failCount: number;
  totalStudents: number;
}

export interface ClassBroadsheetResult {
  classId: string;
  className: string;
  examinationId: string;
  examinationName: string;
  totalStudents: number;
  classAverageGpa: number;
  classAveragePercentage: number;
  highestGpa: number;
  lowestGpa: number;
  students: StudentSummaryResult[];
  subjectMatrix: SubjectMatrixItem[];
}
