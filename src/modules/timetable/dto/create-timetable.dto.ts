import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class CreateTimetableDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @IsString()
  @IsNotEmpty()
  termId!: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  name?: string;
}

export class CreateTimetableEntryDto {
  @IsString()
  @IsNotEmpty()
  timetableId!: string;

  @IsEnum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])
  dayOfWeek!: string;

  @IsString()
  @IsNotEmpty()
  startTime!: string; // e.g., '08:00'

  @IsString()
  @IsNotEmpty()
  endTime!: string; // e.g., '08:50'

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @IsString()
  @IsOptional()
  classroom?: string;
}
