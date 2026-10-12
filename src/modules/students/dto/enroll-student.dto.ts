import { IsString, IsNotEmpty, IsOptional, IsEmail, IsDateString, IsIn } from 'class-validator';

export class EnrollFromOfferDto {
  @IsNotEmpty()
  @IsString()
  offerId: string;

  @IsNotEmpty()
  @IsString()
  classId: string;

  @IsOptional()
  @IsString()
  customAdmissionNumber?: string;

  @IsOptional()
  @IsString()
  rollNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class DirectEnrollStudentDto {
  @IsNotEmpty()
  @IsString()
  campusId: string;

  @IsNotEmpty()
  @IsString()
  academicYearId: string;

  @IsNotEmpty()
  @IsString()
  classId: string;

  @IsOptional()
  @IsString()
  admissionNumber?: string;

  @IsOptional()
  @IsString()
  customAdmissionNumber?: string;

  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  stateOfResidence?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  stateOfOrigin?: string;

  @IsOptional()
  @IsString()
  lgaOfOrigin?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  religion?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  emergencyContactRelationship?: string;

  @IsOptional()
  @IsString()
  genotype?: string;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  medicalConditions?: string;

  @IsOptional()
  @IsString()
  previousSchool?: string;

  @IsNotEmpty()
  @IsString()
  parentFirstName: string;

  @IsNotEmpty()
  @IsString()
  parentLastName: string;

  @IsNotEmpty()
  @IsString()
  parentPhone: string;

  @IsOptional()
  @IsEmail()
  parentEmail?: string;

  @IsOptional()
  @IsString()
  parentRelationship?: string;

  @IsOptional()
  @IsString()
  parentAddress?: string;

  @IsOptional()
  @IsString()
  rollNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
