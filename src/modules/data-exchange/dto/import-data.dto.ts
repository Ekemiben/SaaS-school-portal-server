import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export interface RowValidationError {
  row: number;
  column: string;
  value: any;
  message: string;
}

export interface ImportValidationResultDto {
  type: string;
  mode: 'DRY_RUN' | 'COMMIT';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: RowValidationError[];
  createdCount?: number;
  jobId?: string;
  summaryMessage: string;
}

export class ImportCsvRawDto {
  @IsString()
  @IsNotEmpty()
  csvContent: string;

  @IsString()
  @IsOptional()
  @IsIn(['DRY_RUN', 'COMMIT', 'dry_run', 'commit'])
  mode?: string;

  @IsString()
  @IsOptional()
  campusId?: string;
}

export class ImportStudentsDto extends ImportCsvRawDto {}
export class ImportParentsDto extends ImportCsvRawDto {}
export class ImportStaffDto extends ImportCsvRawDto {}
export class ImportGradesDto extends ImportCsvRawDto {}
