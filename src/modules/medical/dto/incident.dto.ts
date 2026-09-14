import {
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsArray,
} from 'class-validator';

export enum IncidentSeverity {
  MINOR = 'MINOR', // Superficial cut, mild bruise
  MODERATE = 'MODERATE', // Sprain, nosebleed, minor burn
  MAJOR = 'MAJOR', // Suspected fracture, severe concussion, deep laceration
  CRITICAL_EMERGENCY = 'CRITICAL_EMERGENCY', // Anaphylaxis, cardiac event, severe head trauma
}

export enum IncidentLocation {
  CLASSROOM = 'CLASSROOM',
  PLAYGROUND_SPORTS_FIELD = 'PLAYGROUND_SPORTS_FIELD',
  SCIENCE_LAB = 'SCIENCE_LAB',
  BOARDING_HOSTEL = 'BOARDING_HOSTEL',
  SCHOOL_BUS = 'SCHOOL_BUS',
  DINING_HALL = 'DINING_HALL',
  OTHER = 'OTHER',
}

export class CreateHealthIncidentDto {
  @IsString()
  studentId!: string;

  @IsString()
  incidentType!: string; // e.g. "Sports Fracture", "Chemical Burn", "Concussion"

  @IsEnum(IncidentSeverity)
  severity!: IncidentSeverity;

  @IsEnum(IncidentLocation)
  location!: IncidentLocation;

  @IsString()
  occurredAt!: string; // ISO / YYYY-MM-DD HH:mm

  @IsString()
  description!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  witnessStaffNames?: string[];

  @IsString()
  immediateFirstAidGiven!: string;

  @IsBoolean()
  isHospitalReferralRequired: boolean = false;

  @IsOptional()
  @IsString()
  hospitalName?: string;

  @IsOptional()
  @IsBoolean()
  ambulanceCalled?: boolean;

  @IsOptional()
  @IsString()
  escortStaffName?: string;

  @IsBoolean()
  notifyParents: boolean = true;

  @IsOptional()
  @IsString()
  followUpActions?: string;
}

export class HealthIncidentFilterDto {
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsEnum(IncidentLocation)
  location?: IncidentLocation;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
