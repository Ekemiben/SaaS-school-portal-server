import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsIn,
} from 'class-validator';

export class CreateStudyMaterialDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;

  @IsString()
  @IsOptional()
  termId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  topic?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'DOCUMENT_PDF',
    'PRESENTATION_PPT',
    'VIDEO_LINK',
    'AUDIO_NOTE',
    'WORKSHEET',
    'EBOOK',
    'EXTERNAL_URL',
    'PAST_EXAM_PAPER',
  ])
  resourceType!: string;

  @IsString()
  @IsOptional()
  fileUrl?: string;

  @IsString()
  @IsOptional()
  fileAssetId?: string;

  @IsString()
  @IsOptional()
  externalUrl?: string;

  @IsNumber()
  @IsOptional()
  fileSizeBytes?: number;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsArray()
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsOptional()
  @IsIn(['STUDENTS_AND_PARENTS', 'TEACHERS_ONLY', 'PUBLIC_SCHOOL'])
  visibilityScope: string = 'STUDENTS_AND_PARENTS';

  @IsBoolean()
  @IsOptional()
  isPublished: boolean = true;
}

export class UpdateStudyMaterialDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  topic?: string;

  @IsString()
  @IsOptional()
  resourceType?: string;

  @IsString()
  @IsOptional()
  fileUrl?: string;

  @IsString()
  @IsOptional()
  externalUrl?: string;

  @IsArray()
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsOptional()
  visibilityScope?: string;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}

export class StudyMaterialFilterDto {
  @IsString()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  subjectId?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  topic?: string;

  @IsString()
  @IsOptional()
  resourceType?: string;

  @IsString()
  @IsOptional()
  visibilityScope?: string;

  @IsString()
  @IsOptional()
  search?: string;
}
