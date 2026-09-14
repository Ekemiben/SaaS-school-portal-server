import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsIn,
} from 'class-validator';

export class AllocateBedDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  hostelId!: string;

  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @IsString()
  @IsNotEmpty()
  bedId!: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  academicSessionId?: string;

  @IsString()
  @IsOptional()
  academicTermId?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  expectedEndDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class TransferBedDto {
  @IsString()
  @IsNotEmpty()
  newHostelId!: string;

  @IsString()
  @IsNotEmpty()
  newRoomId!: string;

  @IsString()
  @IsNotEmpty()
  newBedId!: string;

  @IsString()
  @IsOptional()
  transferReason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class VacateBedDto {
  @IsString()
  @IsOptional()
  checkoutReason?: string;

  @IsDateString()
  @IsOptional()
  actualEndDate?: string;

  @IsString()
  @IsOptional()
  @IsIn(['VACATED', 'EXPELLED', 'TRANSFERRED'])
  status: string = 'VACATED';

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AllocationFilterDto {
  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  hostelId?: string;

  @IsString()
  @IsOptional()
  roomId?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  academicSessionId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'TRANSFERRED', 'VACATED', 'EXPELLED'])
  status?: string;
}
