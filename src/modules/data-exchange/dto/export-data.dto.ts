import {
  IsString,
  IsOptional,
  IsIn,
  IsArray,
  IsBoolean,
} from 'class-validator';

export class CreateExportJobDto {
  @IsString()
  @IsOptional()
  @IsIn(['JSON', 'CSV', 'EXCEL', 'ZIP'])
  format?: string;

  @IsArray()
  @IsOptional()
  entities?: string[]; // e.g. ['students', 'parents', 'teachers', 'attendance', 'fees', 'results', 'inventory', 'hostel', 'library']

  @IsBoolean()
  @IsOptional()
  anonymize?: boolean;
}

export class ExportJobFilterDto {
  @IsString()
  @IsOptional()
  format?: string;

  @IsString()
  @IsOptional()
  status?: string;
}
