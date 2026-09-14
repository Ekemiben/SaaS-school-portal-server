import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum VaccineType {
  BCG = 'BCG',
  OPV = 'OPV',
  PENTAVALENT = 'PENTAVALENT',
  ROTAVIRUS = 'ROTAVIRUS',
  MEASLES = 'MEASLES',
  YELLOW_FEVER = 'YELLOW_FEVER',
  MENINGITIS = 'MENINGITIS',
  COVID19 = 'COVID19',
  HPV = 'HPV',
  TETANUS_TOXOID = 'TETANUS_TOXOID',
  HEPATITIS_B = 'HEPATITIS_B',
  CHICKENPOX = 'CHICKENPOX',
  OTHER = 'OTHER',
}

export enum ImmunizationStatus {
  ADMINISTERED = 'ADMINISTERED',
  SCHEDULED = 'SCHEDULED',
  OVERDUE = 'OVERDUE',
  EXEMPTED = 'EXEMPTED',
}

export class CreateImmunizationRecordDto {
  @IsEnum(VaccineType)
  vaccineType!: VaccineType;

  @IsString()
  vaccineName!: string; // e.g. "Pentavalent (DTP-HepB-Hib)"

  @IsNumber()
  @Min(1)
  doseNumber!: number; // Dose 1, 2, 3, Booster

  @IsString()
  dateAdministered!: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsString()
  administeredByClinic?: string; // e.g. "Lagos State Primary Healthcare Centre"

  @IsOptional()
  @IsString()
  administeredByStaffName?: string;

  @IsOptional()
  @IsString()
  nextBoosterDate?: string;

  @IsEnum(ImmunizationStatus)
  status: ImmunizationStatus = ImmunizationStatus.ADMINISTERED;

  @IsOptional()
  @IsString()
  exemptionReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateImmunizationRecordDto extends CreateImmunizationRecordDto {}

export class BatchRecordImmunizationDto {
  @IsArray()
  @IsString({ each: true })
  studentIds!: string[];

  @ValidateNested()
  @Type(() => CreateImmunizationRecordDto)
  immunizationData!: CreateImmunizationRecordDto;
}
