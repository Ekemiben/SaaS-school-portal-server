import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  audience?: string;

  @IsString()
  @IsOptional()
  recipientGroup?: string;

  @IsString()
  @IsOptional()
  channel?: string;

  @IsString()
  @IsOptional()
  sender?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsOptional()
  channels?: any; // e.g. ['PORTAL', 'EMAIL', 'SMS'] or string

  @IsString()
  @IsOptional()
  attachmentUrl?: string;
}

export class SendDirectMessageDto {
  @IsString()
  @IsNotEmpty()
  recipientUserId!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsString()
  @IsOptional()
  threadId?: string;
}
