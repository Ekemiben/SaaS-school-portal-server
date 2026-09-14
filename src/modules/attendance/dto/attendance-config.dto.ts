import { IsBoolean, IsOptional, IsNumber, Min, Max, IsIn, IsString } from 'class-validator';

export class UpdateAttendanceConfigDto {
  @IsOptional()
  @IsBoolean()
  manualEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  qrEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  rfidEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  biometricEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  externalDeviceEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(3600)
  qrTokenExpirySeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  consecutiveAbsenceThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  lowAttendancePercentageThreshold?: number;

  @IsOptional()
  @IsBoolean()
  autoNotifyParentsOnAbsence?: boolean;

  @IsOptional()
  @IsBoolean()
  autoNotifyParentsOnTruancy?: boolean;

  @IsOptional()
  @IsIn(['SMS', 'EMAIL', 'WHATSAPP', 'ALL'])
  preferredNotificationChannel?: string;
}
