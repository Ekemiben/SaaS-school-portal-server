import {
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  IsUUID,
  IsNotEmpty,
} from 'class-validator';

export enum AudienceType {
  ALL_PARENTS = 'ALL_PARENTS',
  ALL_STUDENTS = 'ALL_STUDENTS',
  ALL_TEACHERS = 'ALL_TEACHERS',
  ALL_STAFF = 'ALL_STAFF',
  SELECTED_CAMPUS = 'SELECTED_CAMPUS',
  SELECTED_CLASS = 'SELECTED_CLASS',
  SELECTED_CLASSES = 'SELECTED_CLASSES',
  STUDENTS_OUTSTANDING_FEES = 'STUDENTS_OUTSTANDING_FEES',
  PARENTS_OUTSTANDING_FEES = 'PARENTS_OUTSTANDING_FEES',
  STUDENTS_ABSENT_TODAY = 'STUDENTS_ABSENT_TODAY',
  PARENTS_ABSENT_TODAY = 'PARENTS_ABSENT_TODAY',
  RESULTS_PUBLISHED_COHORT = 'RESULTS_PUBLISHED_COHORT',
  TRANSPORT_ROUTE_PARENTS = 'TRANSPORT_ROUTE_PARENTS',
  CUSTOM_RECIPIENTS = 'CUSTOM_RECIPIENTS',
}

export class ResolveAudienceDto {
  @IsEnum(AudienceType)
  @IsNotEmpty()
  audienceType!: AudienceType;

  @IsUUID()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  classId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  classIds?: string[];

  @IsString()
  @IsOptional()
  routeId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  customUserIds?: string[];
}

export interface RecipientInfo {
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  role: 'PARENT' | 'STUDENT' | 'TEACHER' | 'STAFF' | 'ADMIN';
  studentId?: string;
  studentName?: string;
}
