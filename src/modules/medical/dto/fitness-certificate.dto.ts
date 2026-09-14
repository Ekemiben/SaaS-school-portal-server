import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsUUID,
} from 'class-validator';

export enum CertificateType {
  ADMISSION_CLEARANCE = 'ADMISSION_CLEARANCE',
  SPORTS_ATHLETICS = 'SPORTS_ATHLETICS',
  HOSTEL_BOARDING = 'HOSTEL_BOARDING',
  EXAM_SPECIAL_ACCOMMODATION = 'EXAM_SPECIAL_ACCOMMODATION',
  RETURN_TO_SCHOOL = 'RETURN_TO_SCHOOL',
  GENERAL_FITNESS = 'GENERAL_FITNESS',
}

export enum FitnessStatus {
  FIT_UNCONDITIONAL = 'FIT_UNCONDITIONAL',
  FIT_WITH_RESTRICTIONS = 'FIT_WITH_RESTRICTIONS',
  TEMPORARILY_UNFIT = 'TEMPORARILY_UNFIT',
  PERMANENTLY_UNFIT_FOR_ACTIVITY = 'PERMANENTLY_UNFIT_FOR_ACTIVITY',
}

export class CreateFitnessCertificateDto {
  @IsUUID()
  @IsNotEmpty()
  studentId!: string;

  @IsEnum(CertificateType)
  @IsNotEmpty()
  certificateType!: CertificateType;

  @IsEnum(FitnessStatus)
  @IsNotEmpty()
  fitnessStatus!: FitnessStatus;

  @IsString()
  @IsNotEmpty()
  examiningPhysician!: string;

  @IsString()
  @IsNotEmpty()
  medicalLicenseNumber!: string;

  @IsString()
  @IsNotEmpty()
  clinicOrHospitalName!: string;

  @IsDateString()
  @IsNotEmpty()
  examinationDate!: string;

  @IsDateString()
  @IsNotEmpty()
  validUntil!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  activityRestrictions?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  accommodations?: string[];

  @IsString()
  @IsOptional()
  clinicalNotes?: string;

  @IsString()
  @IsOptional()
  documentFileId?: string;
}

export class FitnessCertificateFilterDto {
  @IsUUID()
  @IsOptional()
  studentId?: string;

  @IsEnum(CertificateType)
  @IsOptional()
  certificateType?: CertificateType;

  @IsEnum(FitnessStatus)
  @IsOptional()
  fitnessStatus?: FitnessStatus;
}
