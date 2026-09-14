import { IsString, IsNotEmpty, IsOptional, IsDateString, IsIn, IsNumber, Min } from 'class-validator';

export class CreateAttendanceSessionDto {
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
  academicYearId?: string;

  @IsOptional()
  @IsString()
  termId?: string;

  @IsOptional()
  @IsIn(['DAILY', 'MORNING', 'AFTERNOON', 'SUBJECT_PERIOD', 'ASSEMBLY', 'EXAMINATION', 'CUSTOM'])
  sessionType?: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  periodNumber?: number;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;
}

export class GenerateQrTokenDto {
  @IsOptional()
  @IsNumber()
  @Min(10)
  expirySeconds?: number;
}

export class QrCheckInDto {
  @IsNotEmpty()
  @IsString()
  sessionId: string;

  @IsNotEmpty()
  @IsString()
  qrToken: string;

  @IsNotEmpty()
  @IsString()
  studentId: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class DeviceCheckInDto {
  @IsNotEmpty()
  @IsString()
  campusId: string;

  @IsNotEmpty()
  @IsIn(['RFID', 'BIOMETRIC', 'EXTERNAL_DEVICE'])
  method: 'RFID' | 'BIOMETRIC' | 'EXTERNAL_DEVICE';

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @IsOptional()
  @IsIn(['PRESENT', 'LATE'])
  status?: 'PRESENT' | 'LATE';
}
