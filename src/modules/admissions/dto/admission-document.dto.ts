import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsIn } from 'class-validator';

export class UploadAdmissionDocumentDto {
  @IsNotEmpty()
  @IsIn([
    'BIRTH_CERTIFICATE',
    'PREVIOUS_REPORT',
    'PASSPORT_PHOTO',
    'MEDICAL_FITNESS',
    'IMMUNIZATION_RECORD',
    'OTHER',
  ])
  documentType: string;

  @IsNotEmpty()
  @IsString()
  originalName: string;

  @IsNotEmpty()
  @IsString()
  mimeType: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  sizeBytes: number;

  @IsOptional()
  @IsString()
  storageKey?: string;

  @IsOptional()
  @IsString()
  fileAssetId?: string;
}

export class VerifyAdmissionDocumentDto {
  @IsNotEmpty()
  @IsIn(['VERIFIED', 'REJECTED', 'PENDING'])
  status: string;

  @IsOptional()
  @IsString()
  rejectionNotes?: string;
}
