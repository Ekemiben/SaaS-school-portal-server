import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsBoolean, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum VehicleOwnershipType {
  SCHOOL_OWNED = 'SCHOOL_OWNED',
  HIRED = 'HIRED',
  OUTSOURCED = 'OUTSOURCED',
  PRIVATE_DRIVER = 'PRIVATE_DRIVER',
  OTHER = 'OTHER',
}

export enum TrackingMode {
  NONE = 'NONE',
  PHONE = 'PHONE',
  SCHOOL_PHONE = 'SCHOOL_PHONE',
  GPS_DEVICE = 'GPS_DEVICE',
}

export enum TripStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum TripType {
  PICKUP = 'PICKUP',
  DROPOFF = 'DROPOFF',
  EVENT = 'EVENT',
  CUSTOM = 'CUSTOM',
}

export enum BoardingStatus {
  WAITING = 'WAITING',
  BOARDED = 'BOARDED',
  DROPPED_OFF = 'DROPPED_OFF',
  ABSENT = 'ABSENT',
  EXCUSED = 'EXCUSED',
}

export enum BoardingMethod {
  MANUAL = 'MANUAL',
  DRIVER_APP = 'DRIVER_APP',
  STAFF_APP = 'STAFF_APP',
  QR = 'QR',
  RFID = 'RFID',
}

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty()
  vehicleNumber!: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsEnum(VehicleOwnershipType)
  ownershipType?: VehicleOwnershipType;

  @IsOptional()
  @IsString()
  providerName?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  driverPhone?: string;

  @IsOptional()
  @IsBoolean()
  trackingEnabled?: boolean;

  @IsOptional()
  @IsEnum(TrackingMode)
  trackingMode?: TrackingMode;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  deviceSecret?: string;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsEnum(VehicleOwnershipType)
  ownershipType?: VehicleOwnershipType;

  @IsOptional()
  @IsString()
  providerName?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  driverPhone?: string;

  @IsOptional()
  @IsBoolean()
  trackingEnabled?: boolean;

  @IsOptional()
  @IsEnum(TrackingMode)
  trackingMode?: TrackingMode;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class StartTripDto {
  @IsString()
  @IsNotEmpty()
  routeId!: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsEnum(TripType)
  tripType?: TripType;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  driverPhone?: string;

  @IsOptional()
  @IsEnum(TrackingMode)
  trackingMode?: TrackingMode;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTripStatusDto {
  @IsEnum(TripStatus)
  status!: TripStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordBoardingDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsEnum(BoardingStatus)
  status!: BoardingStatus;

  @IsOptional()
  @IsString()
  stopId?: string;

  @IsOptional()
  @IsString()
  stopName?: string;

  @IsOptional()
  @IsEnum(BoardingMethod)
  boardingMethod?: BoardingMethod;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class IngestTelemetryDto {
  @IsString()
  @IsNotEmpty()
  vehicleNumber!: string;

  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsString()
  routeId?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsNumber()
  speed?: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @IsOptional()
  @IsEnum(TrackingMode)
  source?: TrackingMode;

  @IsOptional()
  @IsString()
  recordedAt?: string;
}
