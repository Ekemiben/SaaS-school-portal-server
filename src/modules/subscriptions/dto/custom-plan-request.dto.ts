import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateCustomPlanRequestDto {
  @IsString()
  @IsNotEmpty()
  schoolName: string;

  @IsString()
  @IsNotEmpty()
  contactPersonName: string;

  @IsEmail()
  @IsNotEmpty()
  contactEmail: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  estimatedStudents?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  campusCount?: number;

  @IsOptional()
  requestedFeatures?: any;

  @IsString()
  @IsOptional()
  message?: string;
}
