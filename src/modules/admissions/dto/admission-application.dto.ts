import { IsString, IsNotEmpty, IsOptional, IsEmail, IsDateString, IsIn, IsArray } from 'class-validator';

export class CreateAdmissionApplicationDto {
  @IsNotEmpty()
  @IsString()
  campusId: string;

  @IsNotEmpty()
  @IsString()
  academicYearId: string;

  @IsNotEmpty()
  @IsString()
  gradeLevel: string;

  @IsNotEmpty()
  @IsString()
  studentFirstName: string;

  @IsOptional()
  @IsString()
  studentMiddleName?: string;

  @IsNotEmpty()
  @IsString()
  studentLastName: string;

  @IsNotEmpty()
  @IsDateString()
  dateOfBirth: string;

  @IsNotEmpty()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  previousSchool?: string;

  @IsOptional()
  @IsString()
  previousGrade?: string;

  @IsNotEmpty()
  @IsString()
  parentFirstName: string;

  @IsNotEmpty()
  @IsString()
  parentLastName: string;

  @IsNotEmpty()
  @IsEmail()
  parentEmail: string;

  @IsNotEmpty()
  @IsString()
  parentPhone: string;

  @IsOptional()
  @IsString()
  parentRelationship?: string;

  @IsOptional()
  @IsString()
  parentAddress?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  inquiryId?: string;
}

export class UpdateAdmissionApplicationDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  gradeLevel?: string;

  @IsOptional()
  @IsString()
  studentFirstName?: string;

  @IsOptional()
  @IsString()
  studentMiddleName?: string;

  @IsOptional()
  @IsString()
  studentLastName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  previousSchool?: string;

  @IsOptional()
  @IsString()
  previousGrade?: string;

  @IsOptional()
  @IsString()
  parentFirstName?: string;

  @IsOptional()
  @IsString()
  parentLastName?: string;

  @IsOptional()
  @IsEmail()
  parentEmail?: string;

  @IsOptional()
  @IsString()
  parentPhone?: string;

  @IsOptional()
  @IsString()
  parentAddress?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;
}

export class TransitionApplicationStatusDto {
  @IsNotEmpty()
  @IsIn([
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'SCREENING',
    'ENTRANCE_TEST',
    'INTERVIEW',
    'OFFERED',
    'ACCEPTED',
    'REJECTED',
    'WITHDRAWN',
    'EXPIRED',
  ])
  status: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class AssignReviewerDto {
  @IsNotEmpty()
  @IsString()
  reviewerUserId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddInternalNoteDto {
  @IsNotEmpty()
  @IsString()
  note: string;
}

export class AdmissionApplicationFilterDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  gradeLevel?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  reviewerUserId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
