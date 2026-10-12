import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsArray,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import {
  TransitionStatus,
  TransitionPathway,
  TransitionEventType,
  RsvpStatus,
  ShowcaseCategory,
  InquiryStatus,
} from '@prisma/client';

// ==========================================
// CONFIG DTOs
// ==========================================

export class CreateTransitionConfigDto {
  @IsString()
  academicYearId: string;

  @IsString()
  sourceClassId: string;

  @IsString()
  targetClassId: string;

  @IsOptional()
  @IsDateString()
  applicationStartDate?: string;

  @IsOptional()
  @IsDateString()
  applicationEndDate?: string;

  @IsOptional()
  @IsDateString()
  earlyBirdDeadline?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  earlyBirdDiscountPercent?: number;

  @IsOptional()
  @IsBoolean()
  autoApproveEligible?: boolean;

  @IsOptional()
  @IsNumber()
  minAttendancePercent?: number;

  @IsOptional()
  @IsNumber()
  minAcademicAverage?: number;

  @IsOptional()
  @IsBoolean()
  requireEntranceExam?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  settings?: any;
}

export class UpdateTransitionConfigDto {
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  sourceClassId?: string;

  @IsOptional()
  @IsString()
  targetClassId?: string;

  @IsOptional()
  @IsDateString()
  applicationStartDate?: string;

  @IsOptional()
  @IsDateString()
  applicationEndDate?: string;

  @IsOptional()
  @IsDateString()
  earlyBirdDeadline?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  earlyBirdDiscountPercent?: number;

  @IsOptional()
  @IsBoolean()
  autoApproveEligible?: boolean;

  @IsOptional()
  @IsNumber()
  minAttendancePercent?: number;

  @IsOptional()
  @IsNumber()
  minAcademicAverage?: number;

  @IsOptional()
  @IsBoolean()
  requireEntranceExam?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  settings?: any;
}

// ==========================================
// APPLICATION DTOs
// ==========================================

export class CreateTransitionApplicationDto {
  @IsString()
  studentId: string;

  @IsString()
  academicYearId: string;

  @IsString()
  sourceClassId: string;

  @IsString()
  targetClassId: string;

  @IsOptional()
  @IsEnum(TransitionPathway)
  pathway?: TransitionPathway;

  @IsOptional()
  @IsString()
  scholarshipId?: string;

  @IsOptional()
  @IsString()
  parentNotes?: string;
}

export class ParentSubmitTransitionDto {
  @IsString()
  studentId: string;

  @IsOptional()
  @IsEnum(TransitionPathway)
  pathway?: TransitionPathway;

  @IsOptional()
  @IsString()
  scholarshipId?: string;

  @IsOptional()
  @IsString()
  parentNotes?: string;
}

export class ParentOptOutTransitionDto {
  @IsString()
  studentId: string;

  @IsOptional()
  @IsString()
  reasonId?: string;

  @IsOptional()
  @IsString()
  notContinuingReason?: string;

  @IsOptional()
  @IsString()
  intendedDestination?: string;
}

export class UpdateTransitionApplicationStatusDto {
  @IsEnum(TransitionStatus)
  status: TransitionStatus;

  @IsOptional()
  @IsString()
  internalNotes?: string;

  @IsOptional()
  @IsNumber()
  discountPercentage?: number;

  @IsOptional()
  @IsNumber()
  waiverAmount?: number;

  @IsOptional()
  @IsString()
  scholarshipId?: string;

  @IsOptional()
  @IsString()
  reasonId?: string;

  @IsOptional()
  @IsString()
  notContinuingReason?: string;
}

export class BulkReviewTransitionDto {
  @IsArray()
  @IsString({ each: true })
  applicationIds: string[];

  @IsEnum(TransitionStatus)
  status: TransitionStatus;

  @IsOptional()
  @IsString()
  internalNotes?: string;
}

// ==========================================
// BENEFIT DTOs
// ==========================================

export class CreateTransitionBenefitDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  fixedDiscount?: number;

  @IsOptional()
  @IsString()
  feeStructureId?: string;

  @IsOptional()
  @IsBoolean()
  isAutomatic?: boolean;

  @IsOptional()
  criteria?: any;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTransitionBenefitDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  fixedDiscount?: number;

  @IsOptional()
  @IsString()
  feeStructureId?: string;

  @IsOptional()
  @IsBoolean()
  isAutomatic?: boolean;

  @IsOptional()
  criteria?: any;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ==========================================
// SCHOLARSHIP DTOs
// ==========================================

export class CreateTransitionScholarshipDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  criteria?: string;

  @IsOptional()
  @IsNumber()
  coveragePercent?: number;

  @IsOptional()
  @IsNumber()
  slotsAvailable?: number;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTransitionScholarshipDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  criteria?: string;

  @IsOptional()
  @IsNumber()
  coveragePercent?: number;

  @IsOptional()
  @IsNumber()
  slotsAvailable?: number;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ==========================================
// EVENT DTOs
// ==========================================

export class CreateTransitionEventDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TransitionEventType)
  eventType?: TransitionEventType;

  @IsDateString()
  eventDate: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  virtualLink?: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateTransitionEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TransitionEventType)
  eventType?: TransitionEventType;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  virtualLink?: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class TransitionRsvpDto {
  @IsString()
  eventId: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsEnum(RsvpStatus)
  status?: RsvpStatus;

  @IsOptional()
  @IsNumber()
  guestCount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ==========================================
// INQUIRY DTOs
// ==========================================

export class CreateTransitionInquiryDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsString()
  subject: string;

  @IsString()
  question: string;
}

export class RespondTransitionInquiryDto {
  @IsString()
  response: string;

  @IsOptional()
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;
}

// ==========================================
// SHOWCASE DTOs
// ==========================================

export class CreateTransitionShowcaseItemDto {
  @IsEnum(ShowcaseCategory)
  category: ShowcaseCategory;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  badgeText?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  metadata?: any;
}

export class UpdateTransitionShowcaseItemDto {
  @IsOptional()
  @IsEnum(ShowcaseCategory)
  category?: ShowcaseCategory;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  badgeText?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  metadata?: any;
}

// ==========================================
// REASON DTOs
// ==========================================

export class CreateTransitionReasonDto {
  @IsString()
  code: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTransitionReasonDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
