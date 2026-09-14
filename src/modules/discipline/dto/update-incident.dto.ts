import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsBoolean,
  IsArray,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class UpdateDisciplineIncidentDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
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
  category?: string;

  @IsString()
  @IsOptional()
  @IsIn(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'])
  severity?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  demeritPoints?: number;

  @IsString()
  @IsOptional()
  location?: string;

  @IsDateString()
  @IsOptional()
  incidentDate?: string;

  @IsString()
  @IsOptional()
  @IsIn(['REPORTED', 'UNDER_INVESTIGATION', 'ACTION_PENDING', 'RESOLVED', 'APPEALED', 'DISMISSED'])
  status?: string;

  @IsArray()
  @IsOptional()
  witnessNames?: string[];

  @IsArray()
  @IsOptional()
  evidenceUrls?: string[];

  @IsBoolean()
  @IsOptional()
  parentNotified?: boolean;

  @IsString()
  @IsOptional()
  resolutionNotes?: string;
}

export class ResolveIncidentDto {
  @IsString()
  @IsOptional()
  resolutionNotes?: string;

  @IsBoolean()
  @IsOptional()
  notifyParent?: boolean;
}
