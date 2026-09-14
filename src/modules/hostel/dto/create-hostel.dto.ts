import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';

export class CreateHostelDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['BOYS', 'GIRLS', 'MIXED'])
  gender!: string;

  @IsString()
  @IsOptional()
  wardenName?: string;

  @IsString()
  @IsOptional()
  wardenPhone?: string;

  @IsString()
  @IsOptional()
  wardenUserId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'MAINTENANCE', 'INACTIVE'])
  status: string = 'ACTIVE';
}

export class UpdateHostelDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  @IsIn(['BOYS', 'GIRLS', 'MIXED'])
  gender?: string;

  @IsString()
  @IsOptional()
  wardenName?: string;

  @IsString()
  @IsOptional()
  wardenPhone?: string;

  @IsString()
  @IsOptional()
  wardenUserId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'MAINTENANCE', 'INACTIVE'])
  status?: string;
}

export class CreateHostelRoomDto {
  @IsString()
  @IsNotEmpty()
  hostelId!: string;

  @IsString()
  @IsNotEmpty()
  roomNumber!: string;

  @IsString()
  @IsOptional()
  floor?: string;

  @IsString()
  @IsOptional()
  @IsIn(['STANDARD', 'DELUXE', 'DORMITORY_HALL', 'PREFECT_SUITE'])
  roomType: string = 'STANDARD';

  @IsNumber()
  @Min(1)
  @IsOptional()
  capacity: number = 4;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateHostelRoomDto {
  @IsString()
  @IsOptional()
  roomNumber?: string;

  @IsString()
  @IsOptional()
  floor?: string;

  @IsString()
  @IsOptional()
  @IsIn(['STANDARD', 'DELUXE', 'DORMITORY_HALL', 'PREFECT_SUITE'])
  roomType?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @IsString()
  @IsOptional()
  @IsIn(['AVAILABLE', 'FULL', 'MAINTENANCE'])
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateHostelBedDto {
  @IsString()
  @IsNotEmpty()
  hostelId!: string;

  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @IsString()
  @IsNotEmpty()
  bedNumber!: string;

  @IsString()
  @IsOptional()
  @IsIn(['VACANT', 'OCCUPIED', 'MAINTENANCE', 'RESERVED'])
  status: string = 'VACANT';

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateHostelBedDto {
  @IsString()
  @IsOptional()
  bedNumber?: string;

  @IsString()
  @IsOptional()
  @IsIn(['VACANT', 'OCCUPIED', 'MAINTENANCE', 'RESERVED'])
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
