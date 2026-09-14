import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsIn,
  IsDateString,
} from 'class-validator';

export class CreateBookDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  isbn?: string;

  @IsString()
  @IsOptional()
  isbn13?: string;

  @IsString()
  @IsNotEmpty()
  author!: string;

  @IsString()
  @IsOptional()
  coAuthors?: string;

  @IsString()
  @IsOptional()
  publisher?: string;

  @IsNumber()
  @IsOptional()
  publicationYear?: number;

  @IsString()
  @IsOptional()
  edition?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'MATHEMATICS',
    'SCIENCES',
    'LANGUAGES',
    'LITERATURE',
    'HUMANITIES',
    'TECHNOLOGY',
    'ARTS',
    'GENERAL_KNOWLEDGE',
    'OTHER',
  ])
  category: string = 'GENERAL_KNOWLEDGE';

  @IsString()
  @IsOptional()
  deweyDecimal?: string;

  @IsString()
  @IsOptional()
  shelfLocation?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  initialCopies: number = 1;

  @IsString()
  @IsOptional()
  campusId?: string;
}

export class UpdateBookDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  isbn?: string;

  @IsString()
  @IsOptional()
  isbn13?: string;

  @IsString()
  @IsOptional()
  author?: string;

  @IsString()
  @IsOptional()
  coAuthors?: string;

  @IsString()
  @IsOptional()
  publisher?: string;

  @IsNumber()
  @IsOptional()
  publicationYear?: number;

  @IsString()
  @IsOptional()
  edition?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'MATHEMATICS',
    'SCIENCES',
    'LANGUAGES',
    'LITERATURE',
    'HUMANITIES',
    'TECHNOLOGY',
    'ARTS',
    'GENERAL_KNOWLEDGE',
    'OTHER',
  ])
  category?: string;

  @IsString()
  @IsOptional()
  deweyDecimal?: string;

  @IsString()
  @IsOptional()
  shelfLocation?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @IsString()
  @IsOptional()
  @IsIn(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'ARCHIVED'])
  status?: string;
}

export class CreateBookCopyDto {
  @IsString()
  @IsNotEmpty()
  bookId!: string;

  @IsString()
  @IsNotEmpty()
  accessionNumber!: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  @IsOptional()
  rfidTag?: string;

  @IsString()
  @IsOptional()
  @IsIn(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'])
  condition: string = 'GOOD';

  @IsString()
  @IsOptional()
  @IsIn(['AVAILABLE', 'ISSUED', 'RESERVED', 'MAINTENANCE', 'LOST', 'WEEDED'])
  status: string = 'AVAILABLE';

  @IsNumber()
  @IsOptional()
  purchasePrice?: number;

  @IsDateString()
  @IsOptional()
  acquisitionDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  campusId?: string;
}

export class UpdateBookCopyDto {
  @IsString()
  @IsOptional()
  accessionNumber?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  @IsOptional()
  rfidTag?: string;

  @IsString()
  @IsOptional()
  @IsIn(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'])
  condition?: string;

  @IsString()
  @IsOptional()
  @IsIn(['AVAILABLE', 'ISSUED', 'RESERVED', 'MAINTENANCE', 'LOST', 'WEEDED'])
  status?: string;

  @IsNumber()
  @IsOptional()
  purchasePrice?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
