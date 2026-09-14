import {
  IsString,
  IsOptional,
  IsIn,
} from 'class-validator';

export class BookFilterDto {
  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  deweyDecimal?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  campusId?: string;
}

export class BookCopyFilterDto {
  @IsString()
  @IsOptional()
  bookId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  @IsOptional()
  campusId?: string;
}

export class IssueFilterDto {
  @IsString()
  @IsOptional()
  bookId?: string;

  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  staffUserId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['STUDENT', 'STAFF', 'TEACHER'])
  borrowerType?: string;

  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'RETURNED', 'OVERDUE', 'LOST_CLAIMED'])
  status?: string;

  @IsString()
  @IsOptional()
  campusId?: string;
}

export class ReservationFilterDto {
  @IsString()
  @IsOptional()
  bookId?: string;

  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  campusId?: string;
}

export class FineFilterDto {
  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  staffUserId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'WAIVED'])
  status?: string;

  @IsString()
  @IsOptional()
  issueId?: string;

  @IsString()
  @IsOptional()
  campusId?: string;
}

export class LibraryStatsFilterDto {
  @IsString()
  @IsOptional()
  campusId?: string;
}
