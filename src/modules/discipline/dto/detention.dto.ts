import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
  IsIn,
} from 'class-validator';

export class CreateDetentionSessionDto {
  @IsString()
  @IsNotEmpty()
  campusId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsDateString()
  @IsNotEmpty()
  date!: string;

  @IsString()
  @IsNotEmpty()
  startTime!: string;

  @IsString()
  @IsNotEmpty()
  endTime!: string;

  @IsString()
  @IsNotEmpty()
  location!: string;

  @IsString()
  @IsOptional()
  supervisorUserId?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxCapacity: number = 30;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AssignStudentDetentionDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsOptional()
  incidentId?: string;

  @IsString()
  @IsOptional()
  reflectionNotes?: string;
}

export class RecordDetentionAttendanceDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['ATTENDED', 'ABSENT', 'EXCUSED', 'RESCHEDULED'])
  attendanceStatus!: string;

  @IsString()
  @IsOptional()
  reflectionNotes?: string;
}
