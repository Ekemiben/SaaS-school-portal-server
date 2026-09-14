import {
  IsString,
  IsOptional,
  IsIn,
} from 'class-validator';

export class HostelFilterDto {
  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['BOYS', 'GIRLS', 'MIXED'])
  gender?: string;

  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'MAINTENANCE', 'INACTIVE'])
  status?: string;

  @IsString()
  @IsOptional()
  search?: string;
}

export class RoomFilterDto {
  @IsString()
  @IsOptional()
  hostelId?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['STANDARD', 'DELUXE', 'DORMITORY_HALL', 'PREFECT_SUITE'])
  roomType?: string;

  @IsString()
  @IsOptional()
  @IsIn(['AVAILABLE', 'FULL', 'MAINTENANCE'])
  status?: string;

  @IsString()
  @IsOptional()
  floor?: string;
}

export class BedFilterDto {
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
  @IsIn(['VACANT', 'OCCUPIED', 'MAINTENANCE', 'RESERVED'])
  status?: string;
}

export class HostelSummaryFilterDto {
  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  academicSessionId?: string;
}
