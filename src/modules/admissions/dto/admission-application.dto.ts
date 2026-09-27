import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';

export class CreateAdmissionApplicationDto {
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
  applyingClass?: string;

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
  @IsString()
  candidateName?: string;

  @IsOptional()
  @IsString()
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
  @IsString()
  parentName?: string;

  @IsOptional()
  @IsString()
  parentEmail?: string;

  @IsOptional()
  @IsString()
  parentPhone?: string;

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

  @IsOptional()
  @IsString()
  applicationDate?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  examScore?: number | string | null;

  @IsOptional()
  interviewScore?: number | string | null;

  @IsOptional()
  @IsString()
  decisionNotes?: string;
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
  applyingClass?: string;

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
  @IsString()
  candidateName?: string;

  @IsOptional()
  @IsString()
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
  @IsString()
  parentName?: string;

  @IsOptional()
  @IsString()
  parentEmail?: string;

  @IsOptional()
  @IsString()
  parentPhone?: string;

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
  applicationDate?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  examScore?: number | string | null;

  @IsOptional()
  interviewScore?: number | string | null;

  @IsOptional()
  @IsString()
  decisionNotes?: string;
}

export class TransitionApplicationStatusDto {
  @IsNotEmpty()
  @IsString()
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
