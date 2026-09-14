import { IsString, IsEnum, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';

export enum MedicationRoute {
  ORAL = 'ORAL',
  INHALATION = 'INHALATION',
  TOPICAL = 'TOPICAL',
  INJECTION = 'INJECTION',
  EYE_DROPS = 'EYE_DROPS',
  EAR_DROPS = 'EAR_DROPS',
}

export class RecordMedicationDispensationDto {
  @IsOptional()
  @IsString()
  visitId?: string;

  @IsString()
  studentId!: string;

  @IsString()
  medicationName!: string; // e.g. "Paracetamol 500mg Tablets"

  @IsString()
  dosage!: string; // e.g. "1 tablet (500mg)"

  @IsNumber()
  @Min(1)
  quantityDispensed!: number;

  @IsEnum(MedicationRoute)
  route: MedicationRoute = MedicationRoute.ORAL;

  @IsString()
  administeredAt!: string; // ISO / YYYY-MM-DD HH:mm

  @IsString()
  administeredByStaffName!: string;

  @IsBoolean()
  parentConsentVerified: boolean = true;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
