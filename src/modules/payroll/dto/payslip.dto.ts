import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class QueryStaffPayslipsDto {
  @IsOptional()
  @IsNumber()
  year?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}

export class BulkGeneratePayslipsDto {
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @IsNumber()
  @Min(2000)
  year: number;

  @IsOptional()
  @IsString()
  campusId?: string;
}
