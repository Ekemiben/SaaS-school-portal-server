import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum AgingBucket {
  CURRENT = 'CURRENT', // 0-30 days overdue
  DAYS_31_60 = 'DAYS_31_60', // 31-60 days overdue
  DAYS_61_90 = 'DAYS_61_90', // 61-90 days overdue
  DAYS_90_PLUS = 'DAYS_90_PLUS', // >90 days overdue
}

export enum ReminderLevel {
  PRE_DUE = 'PRE_DUE',
  DUE_DATE = 'DUE_DATE',
  FIRST_OVERDUE = 'FIRST_OVERDUE',
  FINAL_WARNING = 'FINAL_WARNING',
}

export enum ReminderChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  BOTH = 'BOTH',
}

export enum ExamType {
  MID_TERM = 'MID_TERM',
  FINAL_EXAM = 'FINAL_EXAM',
}

export class DefaulterFilterDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  termId?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minDebtAmount?: number;

  @IsOptional()
  @IsEnum(AgingBucket)
  agingBucket?: AgingBucket;
}

export class SendDebtReminderDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invoiceIds?: string[];

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsEnum(ReminderChannel)
  channel!: ReminderChannel;

  @IsEnum(ReminderLevel)
  reminderLevel!: ReminderLevel;

  @IsOptional()
  @IsString()
  customMessage?: string;
}

export class ExamClearancePolicyDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  midTermMinPercentagePaid: number = 50;

  @IsNumber()
  @Min(0)
  @Max(100)
  finalExamMinPercentagePaid: number = 100;

  @IsBoolean()
  blockPortalReportCard: boolean = true;

  @IsBoolean()
  blockExamHallAccess: boolean = true;
}

export class InstallmentItemDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePaymentPlanDto {
  @IsString()
  invoiceId!: string;

  @IsString()
  studentId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstallmentItemDto)
  installments!: InstallmentItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
