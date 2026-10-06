import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import {
  StaffAttendanceStatus,
  StaffClockInStatus,
  StaffClockOutStatus,
  StaffAttendanceDeviceType,
  StaffAttendanceDeviceStatus,
  StaffCorrectionStatus,
} from '@prisma/client';

export class StaffClockInDto {
  @IsString()
  @IsNotEmpty()
  staffIdentifier: string; // employeeNumber or staffId

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  accuracy?: number;

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  kioskToken?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StaffClockOutDto {
  @IsString()
  @IsNotEmpty()
  staffIdentifier: string; // employeeNumber or staffId

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  accuracy?: number;

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  kioskToken?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateStaffLocationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsNumber()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(10)
  @Max(5000)
  radiusMeters?: number = 100;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean = false;
}

export class UpdateStaffLocationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(10)
  @Max(5000)
  radiusMeters?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class RegisterStaffDeviceDto {
  @IsString()
  @IsNotEmpty()
  deviceName: string;

  @IsString()
  @IsNotEmpty()
  deviceFingerprint: string;

  @IsOptional()
  @IsEnum(StaffAttendanceDeviceType)
  deviceType?: StaffAttendanceDeviceType = StaffAttendanceDeviceType.KIOSK;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}

export class UpdateStaffDeviceDto {
  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsEnum(StaffAttendanceDeviceStatus)
  status?: StaffAttendanceDeviceStatus;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}

export class UpdateStaffAttendanceConfigDto {
  @IsOptional()
  @IsString()
  expectedClockInTime?: string;

  @IsOptional()
  @IsString()
  lateThresholdTime?: string;

  @IsOptional()
  @IsString()
  halfDayThresholdTime?: string;

  @IsOptional()
  @IsString()
  expectedClockOutTime?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(120)
  gracePeriodMinutes?: number;

  @IsOptional()
  @IsBoolean()
  requireGps?: boolean;

  @IsOptional()
  @IsBoolean()
  requireDeviceApproval?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(72)
  personalDeviceLockHours?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(10)
  @Max(1000)
  maxAllowedGpsAccuracyMeters?: number;

  @IsOptional()
  @IsString()
  autoClockOutTime?: string;

  @IsOptional()
  @IsBoolean()
  allowKioskMode?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMobileSelfClock?: boolean;
}

export class ManualStaffAttendanceEntryDto {
  @IsString()
  @IsNotEmpty()
  staffId: string;

  @IsString()
  @IsNotEmpty()
  date: string; // YYYY-MM-DD

  @IsOptional()
  @IsEnum(StaffAttendanceStatus)
  status?: StaffAttendanceStatus = StaffAttendanceStatus.PRESENT;

  @IsOptional()
  @IsString()
  clockInTime?: string; // ISO DateTime string or HH:mm

  @IsOptional()
  @IsString()
  clockOutTime?: string; // ISO DateTime string or HH:mm

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StaffAttendanceQueryDto {
  @IsOptional()
  @IsString()
  date?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  startDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  endDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  designationId?: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsOptional()
  @IsEnum(StaffAttendanceStatus)
  status?: StaffAttendanceStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 50;
}

export class RequestStaffCorrectionDto {
  @IsString()
  @IsNotEmpty()
  recordId: string;

  @IsOptional()
  @IsString()
  correctedClockIn?: string;

  @IsOptional()
  @IsString()
  correctedClockOut?: string;

  @IsOptional()
  @IsEnum(StaffAttendanceStatus)
  correctedStatus?: StaffAttendanceStatus;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ReviewStaffCorrectionDto {
  @IsEnum(StaffCorrectionStatus)
  status: StaffCorrectionStatus;

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
