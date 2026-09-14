import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateAllergyDto } from './allergy.dto.js';
import { CreateImmunizationRecordDto } from './immunization.dto.js';

export enum BloodGroup {
  A_POSITIVE = 'A_POSITIVE',
  A_NEGATIVE = 'A_NEGATIVE',
  B_POSITIVE = 'B_POSITIVE',
  B_NEGATIVE = 'B_NEGATIVE',
  AB_POSITIVE = 'AB_POSITIVE',
  AB_NEGATIVE = 'AB_NEGATIVE',
  O_POSITIVE = 'O_POSITIVE',
  O_NEGATIVE = 'O_NEGATIVE',
  UNKNOWN = 'UNKNOWN',
}

export enum Genotype {
  AA = 'AA',
  AS = 'AS',
  SS = 'SS',
  AC = 'AC',
  SC = 'SC',
  CC = 'CC',
  UNKNOWN = 'UNKNOWN',
}

export class ChronicConditionDto {
  @IsString()
  conditionName!: string; // e.g. "Asthma", "Sickle Cell Disease", "Type 1 Diabetes", "Epilepsy"

  @IsOptional()
  @IsString()
  diagnosisDate?: string;

  @IsString()
  severity!: 'MILD' | 'MODERATE' | 'SEVERE';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dailyMedications?: string[];

  @IsString()
  managementProtocol!: string; // e.g. "Salbutamol inhaler 2 puffs before P.E. sports"

  @IsOptional()
  @IsBoolean()
  requiresClinicEmergencyProtocol?: boolean;
}

export class EmergencyContactDto {
  @IsString()
  primaryContactName!: string;

  @IsString()
  relationship!: string; // e.g. "Mother", "Father", "Guardian"

  @IsString()
  primaryPhone!: string;

  @IsOptional()
  @IsString()
  altPhone?: string;

  @IsOptional()
  @IsString()
  preferredHospital?: string;

  @IsOptional()
  @IsString()
  physicianName?: string;

  @IsOptional()
  @IsString()
  physicianPhone?: string;
}

export class PhysicalVitalsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  bmi?: number;

  @IsOptional()
  @IsString()
  visionStatus?: string; // e.g. "Wears Prescription Glasses"

  @IsOptional()
  @IsString()
  hearingStatus?: string; // e.g. "Normal"

  @IsOptional()
  @IsString()
  recordedAt?: string;
}

export class CreateMedicalProfileDto {
  @IsString()
  studentId!: string;

  @IsEnum(BloodGroup)
  bloodGroup: BloodGroup = BloodGroup.UNKNOWN;

  @IsEnum(Genotype)
  genotype: Genotype = Genotype.UNKNOWN;

  @IsOptional()
  @ValidateNested()
  @Type(() => PhysicalVitalsDto)
  vitals?: PhysicalVitalsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChronicConditionDto)
  chronicConditions?: ChronicConditionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAllergyDto)
  allergies?: CreateAllergyDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateImmunizationRecordDto)
  immunizations?: CreateImmunizationRecordDto[];

  @IsOptional()
  @IsString()
  hmoProvider?: string;

  @IsOptional()
  @IsString()
  hmoPolicyNumber?: string;

  @IsOptional()
  @IsString()
  dietaryRestrictions?: string;

  @IsOptional()
  @IsString()
  specialCareNotes?: string;
}

export class UpdateMedicalProfileDto extends CreateMedicalProfileDto {}
