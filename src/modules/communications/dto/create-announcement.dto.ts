import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsEnum(['ALL', 'STAFF', 'PARENTS', 'STUDENTS'])
  audience!: 'ALL' | 'STAFF' | 'PARENTS' | 'STUDENTS';

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsArray()
  @IsOptional()
  channels?: string[]; // e.g. ['PORTAL', 'EMAIL', 'SMS']

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
