import {
  IsEnum,
  IsOptional,
  IsUUID,
  IsNotEmpty,
} from 'class-validator';

export enum PolicyRequirementLevel {
  REQUIRED = 'REQUIRED',
  OPTIONAL = 'OPTIONAL',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  DISABLED = 'DISABLED',
}

export enum ActivityContext {
  SPORTS_ATHLETICS = 'SPORTS_ATHLETICS',
  HOSTEL_BOARDING = 'HOSTEL_BOARDING',
  LAB_EXPERIMENTS = 'LAB_EXPERIMENTS',
  FIELD_TRIPS = 'FIELD_TRIPS',
  ADMISSION_CLEARANCE = 'ADMISSION_CLEARANCE',
  GENERAL_ACADEMICS = 'GENERAL_ACADEMICS',
}

export enum ContextualComplianceStatus {
  NOT_ASSESSED = 'NOT_ASSESSED',
  NOT_REQUIRED = 'NOT_REQUIRED',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  PENDING_REVIEW = 'PENDING_REVIEW',
  CLEARED = 'CLEARED',
  CLEARED_WITH_RESTRICTIONS = 'CLEARED_WITH_RESTRICTIONS',
  EXPIRED = 'EXPIRED',
  REQUIRES_FOLLOW_UP = 'REQUIRES_FOLLOW_UP',
  ACTIVITY_RESTRICTED = 'ACTIVITY_RESTRICTED',
}

export class UpdateSchoolMedicalPolicyDto {
  @IsEnum(PolicyRequirementLevel)
  @IsOptional()
  sportsClearance?: PolicyRequirementLevel;

  @IsEnum(PolicyRequirementLevel)
  @IsOptional()
  hostelClearance?: PolicyRequirementLevel;

  @IsEnum(PolicyRequirementLevel)
  @IsOptional()
  admissionClearance?: PolicyRequirementLevel;

  @IsEnum(PolicyRequirementLevel)
  @IsOptional()
  annualScreening?: PolicyRequirementLevel;

  @IsEnum(PolicyRequirementLevel)
  @IsOptional()
  immunizationTracking?: PolicyRequirementLevel;
}

export class CheckActivityEligibilityDto {
  @IsUUID()
  @IsNotEmpty()
  studentId!: string;

  @IsEnum(ActivityContext)
  @IsNotEmpty()
  activityContext!: ActivityContext;
}
