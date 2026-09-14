import { IsString, IsNotEmpty, IsOptional, IsDateString, IsIn, IsNumber, Min, IsBoolean } from 'class-validator';

export class CreateAdmissionDecisionDto {
  @IsNotEmpty()
  @IsIn(['APPROVED', 'REJECTED', 'WAITLISTED'])
  decision: string;

  @IsOptional()
  @IsString()
  decisionNotes?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class GenerateAdmissionOfferDto {
  @IsNotEmpty()
  @IsString()
  campusId: string;

  @IsNotEmpty()
  @IsString()
  academicYearId: string;

  @IsNotEmpty()
  @IsString()
  offeredGradeLevel: string;

  @IsNotEmpty()
  @IsDateString()
  acceptanceDeadline: string;

  @IsOptional()
  @IsString()
  conditions?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  acceptanceFeeAmount?: number;

  @IsOptional()
  @IsString()
  decisionId?: string;
}

export class RespondToOfferDto {
  @IsNotEmpty()
  @IsIn(['ACCEPTED', 'DECLINED'])
  response: string;

  @IsOptional()
  @IsString()
  declineReason?: string;
}

export class InitializeAcceptancePaymentDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  callbackUrl?: string;
}
