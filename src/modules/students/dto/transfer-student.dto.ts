import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class TransferStudentClassDto {
  @IsNotEmpty()
  @IsString()
  targetClassId: string;

  @IsOptional()
  @IsString()
  rollNumber?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransferStudentCampusDto {
  @IsNotEmpty()
  @IsString()
  targetCampusId: string;

  @IsNotEmpty()
  @IsString()
  targetClassId: string;

  @IsOptional()
  @IsString()
  rollNumber?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
