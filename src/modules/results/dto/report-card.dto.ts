import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class PublishSingleReportCardDto {
  @IsString()
  examinationId!: string;

  @IsString()
  studentId!: string;

  @IsOptional()
  @IsString()
  principalRemarks?: string;

  @IsOptional()
  @IsString()
  classTeacherRemarks?: string;

  @IsOptional()
  @IsString()
  nextTermResumptionDate?: string;
}

export class BatchPublishReportCardsDto {
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
  @IsString()
  nextTermResumptionDate?: string;

  @IsOptional()
  @IsString()
  defaultPrincipalRemarks?: string;

  @IsOptional()
  @IsBoolean()
  notifyParents?: boolean;
}

export interface ReportCardSubjectItem {
  subjectName: string;
  subjectCode: string;
  componentScores?: Record<string, number>;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
  grade: string;
  gradePoint: number;
  subjectRank?: number;
  totalStudents?: number;
  classAverage?: number;
  highestScore?: number;
  lowestScore?: number;
  teacherRemarks?: string;
}

export interface ReportCardRenderData {
  school: {
    name: string;
    slug: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    campusName?: string;
    address?: string;
    phone?: string;
    email?: string;
    currency?: string;
  };
  student: {
    id: string;
    fullName: string;
    admissionNumber: string;
    gender: string;
    className: string;
    gradeLevel?: string;
    attendancePresent?: number;
    attendanceTotal?: number;
    photoUrl?: string;
  };
  examination: {
    id: string;
    name: string;
    termName?: string;
    academicYearName?: string;
    nextTermResumptionDate?: string;
  };
  subjects: ReportCardSubjectItem[];
  summary: {
    totalMarks: number;
    maxMarks: number;
    percentage: number;
    gpa: number;
    cgpa: number;
    classRank: number;
    totalStudentsInClass: number;
    classAveragePercentage: number;
    academicStanding: string;
    principalRemarks: string;
    classTeacherRemarks: string;
  };
  metadata: {
    reportCardId: string;
    issuedAt: string;
    verificationCode: string;
  };
}

export interface ReportCardAssetResponseDto {
  reportCardId: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  examinationId: string;
  classId: string;
  storageKey: string;
  downloadUrl: string;
  gpa: number;
  classRank: number;
  academicStanding: string;
  publishedAt: string;
}
