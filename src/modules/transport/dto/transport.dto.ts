import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum AllocationStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  TERMINATED = 'TERMINATED',
}

export class TransportStopInputDto {
  @IsString()
  @IsNotEmpty()
  stopName!: string;

  @IsOptional()
  @IsNumber()
  stopOrder?: number;

  @IsOptional()
  @IsString()
  pickupTime?: string;

  @IsOptional()
  @IsString()
  dropoffTime?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class CreateTransportRouteDto {
  @IsString()
  @IsNotEmpty()
  campusId!: string;

  @IsString()
  @IsNotEmpty()
  routeName!: string;

  @IsString()
  @IsNotEmpty()
  vehicleNumber!: string;

  @IsString()
  @IsNotEmpty()
  driverName!: string;

  @IsString()
  @IsNotEmpty()
  driverPhone!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransportStopInputDto)
  stops?: TransportStopInputDto[];
}

export class UpdateTransportRouteDto {
  @IsOptional()
  @IsString()
  routeName?: string;

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
  @IsNumber()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransportStopInputDto)
  stops?: TransportStopInputDto[];
}

export class AllocateStudentTransportDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  routeId!: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  pickupStopId?: string;

  @IsOptional()
  @IsString()
  pickupStopName?: string;

  @IsOptional()
  @IsString()
  dropoffStopId?: string;

  @IsOptional()
  @IsString()
  dropoffStopName?: string;

  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @IsOptional()
  @IsString()
  termId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  feeAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTransportAllocationDto {
  @IsOptional()
  @IsEnum(AllocationStatus)
  status?: AllocationStatus;

  @IsOptional()
  @IsString()
  pickupStopName?: string;

  @IsOptional()
  @IsString()
  dropoffStopName?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
