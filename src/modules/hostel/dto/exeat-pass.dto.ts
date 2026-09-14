import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class CreateExeatPassDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  hostelId!: string;

  @IsString()
  @IsOptional()
  roomId?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'WEEKEND_PASS',
    'MEDICAL_LEAVE',
    'EMERGENCY_LEAVE',
    'HOLIDAY_EXEAT',
    'DAY_PASS',
    'OFFICIAL_ASSIGNMENT',
  ])
  exeatType!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsNotEmpty()
  destinationAddress!: string;

  @IsString()
  @IsNotEmpty()
  emergencyPhone!: string;

  @IsString()
  @IsOptional()
  accompanyingGuardian?: string;

  @IsDateString()
  @IsNotEmpty()
  departureDate!: string;

  @IsDateString()
  @IsNotEmpty()
  expectedReturnDate!: string;

  @IsString()
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'WAIVED'])
  parentConsentStatus: string = 'PENDING';
}

export class ApproveExeatPassDto {
  @IsBoolean()
  approved!: boolean;

  @IsString()
  @IsOptional()
  rejectionReason?: string;

  @IsString()
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'WAIVED'])
  parentConsentStatus?: string;
}

export class LogExeatDepartureDto {
  @IsString()
  @IsOptional()
  checkoutNotes?: string;

  @IsDateString()
  @IsOptional()
  departureDate?: string;
}

export class LogExeatReturnDto {
  @IsString()
  @IsOptional()
  checkinNotes?: string;

  @IsDateString()
  @IsOptional()
  actualReturnDate?: string;
}

export class ExeatFilterDto {
  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  hostelId?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'WEEKEND_PASS',
    'MEDICAL_LEAVE',
    'EMERGENCY_LEAVE',
    'HOLIDAY_EXEAT',
    'DAY_PASS',
    'OFFICIAL_ASSIGNMENT',
  ])
  exeatType?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'PENDING_PARENT_CONSENT',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'DEPARTED',
    'RETURNED',
    'OVERDUE',
    'CANCELLED',
  ])
  status?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
