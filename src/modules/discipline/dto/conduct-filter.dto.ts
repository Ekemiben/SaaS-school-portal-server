import { IsString, IsOptional } from 'class-validator';

export class ConductFilterDto {
  @IsString()
  @IsOptional()
  campusId?: string;

  @IsString()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;

  @IsString()
  @IsOptional()
  termId?: string;
}
