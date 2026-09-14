import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class SubmitHomeworkDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsOptional()
  submissionText?: string;

  @IsArray()
  @IsOptional()
  attachmentUrls?: Array<{
    fileAssetId?: string;
    url: string;
    name: string;
    sizeBytes?: number;
    mimeType?: string;
  }>;

  // Backwards compatibility legacy field
  @IsString()
  @IsOptional()
  attachmentKey?: string;
}

export class ResubmitHomeworkDto {
  @IsString()
  @IsOptional()
  submissionText?: string;

  @IsArray()
  @IsOptional()
  attachmentUrls?: Array<{
    fileAssetId?: string;
    url: string;
    name: string;
    sizeBytes?: number;
    mimeType?: string;
  }>;
}
