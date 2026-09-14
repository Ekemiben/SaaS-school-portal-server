import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsIn,
} from 'class-validator';

export class CreateBookReservationDto {
  @IsString()
  @IsNotEmpty()
  bookId!: string;

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
  @IsOptional()
  expiryDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  campusId?: string;
}

export class UpdateReservationDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['ACTIVE_WAITING', 'READY_FOR_PICKUP', 'FULFILLED', 'CANCELLED', 'EXPIRED'])
  status!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
