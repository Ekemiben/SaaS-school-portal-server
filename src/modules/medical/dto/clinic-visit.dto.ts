import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PatientType {
  STUDENT = 'STUDENT',
  STAFF = 'STAFF',
  VISITOR = 'VISITOR',
}

export enum VisitType {
  ROUTINE_CHECKUP = 'ROUTINE_CHECKUP',
  FIRST_AID_INJURY = 'FIRST_AID_INJURY',
  ILLNESS_COMPLAINT = 'ILLNESS_COMPLAINT',
  MEDICATION_ADMINISTRATION = 'MEDICATION_ADMINISTRATION',
  EMERGENCY = 'EMERGENCY',
}

export enum VisitOutcome {
  DISCHARGED_TO_CLASS = 'DISCHARGED_TO_CLASS',
  RESTING_IN_SICKBAY = 'RESTING_IN_SICKBAY',
  SENT_HOME_TO_PARENTS = 'SENT_HOME_TO_PARENTS',
  REFERRED_TO_HOSPITAL = 'REFERRED_TO_HOSPITAL',
}

export class ClinicalVitalsDto {
  @IsOptional()
  @IsNumber()
  temperatureCelsius?: number;

  @IsOptional()
  @IsNumber()
  pulseBpm?: number;

  @IsOptional()
  @IsNumber()
  systolicBp?: number;

  @IsOptional()
  @IsNumber()
  diastolicBp?: number;

  @IsOptional()
  @IsNumber()
  respiratoryRate?: number;

  @IsOptional()
  @IsNumber()
  spo2Percentage?: number;
}

export class CreateClinicVisitDto {
  @IsEnum(PatientType)
  patientType: PatientType = PatientType.STUDENT;

  @IsString()
  patientId!: string;

  @IsEnum(VisitType)
  visitType!: VisitType;

  @IsString()
  chiefComplaint!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ClinicalVitalsDto)
  vitals?: ClinicalVitalsDto;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  treatmentGiven?: string;

  @IsEnum(VisitOutcome)
  outcome: VisitOutcome = VisitOutcome.DISCHARGED_TO_CLASS;

  @IsOptional()
  @IsString()
  sickbayBedNumber?: string;

  @IsOptional()
  @IsString()
  attendedByStaffId?: string;

  @IsOptional()
  @IsString()
  attendedByStaffName?: string;

  @IsOptional()
  @IsBoolean()
  notifyParents?: boolean;
}

export class DischargePatientDto {
  @IsEnum(VisitOutcome)
  outcome!: VisitOutcome;

  @IsOptional()
  @IsString()
  dischargedAt?: string;

  @IsOptional()
  @IsString()
  dischargeNotes?: string;
}

export class ClinicVisitFilterDto {
  @IsOptional()
  @IsEnum(PatientType)
  patientType?: PatientType;

  @IsOptional()
  @IsEnum(VisitType)
  visitType?: VisitType;

  @IsOptional()
  @IsEnum(VisitOutcome)
  outcome?: VisitOutcome;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
