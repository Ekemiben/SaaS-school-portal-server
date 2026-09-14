import { IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';

export enum AllergySeverity {
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  LIFE_THREATENING = 'LIFE_THREATENING',
}

export enum AllergyCategory {
  FOOD = 'FOOD',
  MEDICATION = 'MEDICATION',
  ENVIRONMENTAL = 'ENVIRONMENTAL',
  INSECT = 'INSECT',
  OTHER = 'OTHER',
}

export class CreateAllergyDto {
  @IsString()
  allergen!: string; // e.g. "Peanuts", "Penicillin", "Bee Venom"

  @IsEnum(AllergyCategory)
  category!: AllergyCategory;

  @IsEnum(AllergySeverity)
  severity!: AllergySeverity;

  @IsString()
  reactionSymptoms!: string; // e.g. "Hives, facial swelling, anaphylaxis"

  @IsString()
  emergencyTreatment!: string; // e.g. "Administer EpiPen 0.3mg immediately"

  @IsOptional()
  @IsBoolean()
  isEpiPenRequired?: boolean;

  @IsOptional()
  @IsString()
  medicationLocation?: string; // e.g. "School Clinic Cabinet 2B / Student Backpack"
}

export class UpdateAllergyDto extends CreateAllergyDto {}
