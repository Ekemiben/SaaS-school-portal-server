import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsIn,
  IsDateString,
  IsInt,
} from 'class-validator';

export class CreatePublicInquiryDto {
  @IsNotEmpty()
  @IsString()
  studentName: string;

  @IsNotEmpty()
  @IsString()
  parentName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  gradeApplying?: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateInquiryStatusDto {
  @IsNotEmpty()
  @IsIn(['NEW', 'CONTACTED', 'SCHEDULED', 'CONVERTED', 'CLOSED'])
  status: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateWebsiteConfigDto {
  @IsOptional()
  @IsString()
  motto?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsString()
  aboutStory?: string;

  @IsOptional()
  @IsString()
  aboutMission?: string;

  @IsOptional()
  @IsString()
  aboutVision?: string;

  @IsOptional()
  @IsString()
  aboutValues?: string;

  @IsOptional()
  @IsString()
  principalName?: string;

  @IsOptional()
  @IsString()
  principalTitle?: string;

  @IsOptional()
  @IsString()
  principalMessage?: string;

  @IsOptional()
  @IsString()
  principalPhotoUrl?: string;

  @IsOptional()
  @IsString()
  heroTitle?: string;

  @IsOptional()
  @IsString()
  heroSubtitle?: string;

  @IsOptional()
  @IsString()
  heroCtaText?: string;

  @IsOptional()
  @IsString()
  heroCtaLink?: string;

  @IsOptional()
  @IsString()
  heroImageUrl?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  mapCoordinates?: string;

  @IsOptional()
  @IsString()
  facebookUrl?: string;

  @IsOptional()
  @IsString()
  twitterUrl?: string;

  @IsOptional()
  @IsString()
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  youtubeUrl?: string;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;

  @IsOptional()
  @IsString()
  seoKeywords?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class CreatePublicPageDto {
  @IsNotEmpty()
  @IsString()
  slug: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class UpdatePublicPageDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class CreatePublicNewsDto {
  @IsNotEmpty()
  @IsString()
  slug: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  authorName?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class UpdatePublicNewsDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  authorName?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class CreatePublicEventDto {
  @IsNotEmpty()
  @IsString()
  slug: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class UpdatePublicEventDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class CreatePublicAnnouncementDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsIn(['NORMAL', 'HIGH', 'URGENT'])
  priority?: 'NORMAL' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdatePublicAnnouncementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsIn(['NORMAL', 'HIGH', 'URGENT'])
  priority?: 'NORMAL' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateGalleryMediaDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsNotEmpty()
  @IsString()
  mediaUrl: string;

  @IsOptional()
  @IsIn(['IMAGE', 'VIDEO'])
  mediaType?: 'IMAGE' | 'VIDEO';

  @IsOptional()
  @IsString()
  albumName?: string;

  @IsOptional()
  @IsInt()
  orderIndex?: number;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}
