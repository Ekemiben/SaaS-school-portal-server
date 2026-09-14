import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

export class InitiateUploadDto {
  @IsString()
  @IsNotEmpty()
  originalName!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @Min(1)
  sizeBytes!: number;

  @IsString()
  @IsOptional()
  category?: string;
}
