import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsDateString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export type AttendanceStatusType = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
export type AttendanceMethodType = 'MANUAL' | 'QR' | 'RFID' | 'BIOMETRIC' | 'EXTERNAL_DEVICE';
export type SessionType = 'DAILY' | 'MORNING' | 'AFTERNOON' | 'SUBJECT_PERIOD' | 'ASSEMBLY' | 'EXAMINATION' | 'CUSTOM';

export class SingleStudentAttendanceRecordDto {
  @IsNotEmpty()
  @IsString()
  studentId: string;

  @IsNotEmpty()
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])
  status: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsDateString()
  checkInTime?: string;

  @IsOptional()
  @IsDateString()
  checkOutTime?: string;
}

export class MarkAttendanceDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsNotEmpty()
  @IsString()
  classId: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsIn(['DAILY', 'MORNING', 'AFTERNOON', 'SUBJECT_PERIOD', 'ASSEMBLY', 'EXAMINATION', 'CUSTOM'])
  sessionType?: string;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsOptional()
  @IsIn(['MANUAL', 'QR', 'RFID', 'BIOMETRIC', 'EXTERNAL_DEVICE'])
  method?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SingleStudentAttendanceRecordDto)
  records: SingleStudentAttendanceRecordDto[];
}

export class AttendanceFilterDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])
  status?: string;

  @IsOptional()
  @IsIn(['DAILY', 'MORNING', 'AFTERNOON', 'SUBJECT_PERIOD', 'ASSEMBLY', 'EXAMINATION', 'CUSTOM'])
  sessionType?: string;
}
