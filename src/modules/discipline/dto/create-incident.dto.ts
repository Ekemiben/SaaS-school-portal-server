import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  IsBoolean,
  IsArray,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateDisciplineIncidentDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;

  @IsString()
  @IsOptional()
  termId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'TARDINESS',
    'DRESS_CODE',
    'DISRUPTIVE_BEHAVIOR',
    'HOMEWORK_NEGLECT',
    'ACADEMIC_DISHONESTY',
    'BULLYING',
    'PHYSICAL_ALTERCATION',
    'VANDALISM',
    'SUBSTANCE_MISCONDUCT',
    'UNAUTHORIZED_ABSENCE',
    'OTHER',
  ])
  category!: string;

  @IsString()
  @IsOptional()
  @IsIn(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'])
  severity: string = 'MINOR';

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  demeritPoints: number = 1;

  @IsString()
  @IsOptional()
  location?: string;

  @IsDateString()
  @IsOptional()
  incidentDate?: string;

  @IsArray()
  @IsOptional()
  witnessNames?: string[];

  @IsArray()
  @IsOptional()
  evidenceUrls?: string[];

  @IsBoolean()
  @IsOptional()
  parentNotified: boolean = false;
}

export class IncidentFilterDto {
  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  severity?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  search?: string;
}
