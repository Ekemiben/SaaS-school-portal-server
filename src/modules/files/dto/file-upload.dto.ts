import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class PresignUploadDto {
  @IsString()
  @IsNotEmpty()
  originalName!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @Min(1)
  @Max(104857600) // 100MB maximum
  sizeBytes!: number;

  @IsString()
  @IsOptional()
  category?: string;
}

export class PresignDownloadDto {
  @IsString()
  @IsNotEmpty()
  fileId!: string;
}
