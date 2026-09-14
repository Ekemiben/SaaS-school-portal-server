import { IsString, IsNotEmpty, IsOptional, IsEmail, IsIn } from 'class-validator';

export class CreateAdmissionInquiryDto {
  @IsNotEmpty()
  @IsString()
  applicantName: string;

  @IsNotEmpty()
  @IsString()
  parentName: string;

  @IsOptional()
  @IsEmail()
  parentEmail?: string;

  @IsNotEmpty()
  @IsString()
  parentPhone: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  desiredAcademicYearId?: string;

  @IsOptional()
  @IsString()
  desiredGradeLevel?: string;

  @IsOptional()
  @IsIn(['ONLINE', 'PHONE', 'IN_PERSON', 'REFERRAL', 'EMAIL', 'OTHER'])
  channel?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateAdmissionInquiryDto {
  @IsOptional()
  @IsIn(['NEW', 'CONTACTED', 'CONVERTED', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsString()
  followUpNotes?: string;

  @IsOptional()
  @IsString()
  convertedAppId?: string;
}

export class AdmissionInquiryFilterDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  desiredGradeLevel?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
