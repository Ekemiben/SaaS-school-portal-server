import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';

export class IssueBookDto {
  @IsString()
  @IsNotEmpty()
  bookId!: string;

  @IsString()
  @IsOptional()
  bookCopyId?: string;

  @IsString()
  @IsOptional()
  barcodeOrRfid?: string;

  @IsString()
  @IsOptional()
  @IsIn(['STUDENT', 'STAFF', 'TEACHER'])
  borrowerType: string = 'STUDENT';

  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  staffUserId?: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate!: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  campusId?: string;
}

export class ReturnBookDto {
  @IsString()
  @IsOptional()
  @IsIn(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'])
  returnCondition: string = 'GOOD';

  @IsString()
  @IsOptional()
  returnNotes?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  damageFineAmount?: number;
}

export class RenewBookDto {
  @IsDateString()
  @IsNotEmpty()
  newDueDate!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
