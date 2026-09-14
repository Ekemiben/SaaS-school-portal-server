import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCurfewSessionDto {
  @IsString()
  @IsNotEmpty()
  hostelId!: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsDateString()
  @IsOptional()
  sessionDate?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'EVENING_ROLL_CALL',
    'NIGHT_CURFEW',
    'MORNING_HEADCOUNT',
    'WEEKEND_CHECK',
  ])
  sessionType: string = 'NIGHT_CURFEW';

  @IsString()
  @IsOptional()
  notes?: string;
}

export class MarkCurfewAttendanceItemDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsOptional()
  roomId?: string;

  @IsString()
  @IsOptional()
  bedId?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'PRESENT',
    'ABSENT_UNEXCUSED',
    'EXEAT_ON_LEAVE',
    'IN_CLINIC',
    'LATE',
  ])
  status!: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class RecordCurfewAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkCurfewAttendanceItemDto)
  attendances!: MarkCurfewAttendanceItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CurfewFilterDto {
  @IsString()
  @IsOptional()
  hostelId?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  sessionType?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
