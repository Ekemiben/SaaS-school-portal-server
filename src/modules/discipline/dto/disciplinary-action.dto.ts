import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class CreateDisciplinaryActionDto {
  @IsString()
  @IsNotEmpty()
  incidentId!: string;

  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'VERBAL_WARNING',
    'WRITTEN_WARNING',
    'PARENT_CONFERENCE',
    'DETENTION',
    'COMMUNITY_SERVICE',
    'LOSS_OF_PRIVILEGES',
    'BEHAVIORAL_PROBATION',
    'IN_SCHOOL_SUSPENSION',
    'OUT_OF_SCHOOL_SUSPENSION',
    'EXPULSION_RECOMMENDATION',
  ])
  sanctionType!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsBoolean()
  @IsOptional()
  parentNotified: boolean = false;
}

export class UpdateActionStatusDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'CANCELLED'])
  status!: string;

  @IsString()
  @IsOptional()
  completionNotes?: string;
}
