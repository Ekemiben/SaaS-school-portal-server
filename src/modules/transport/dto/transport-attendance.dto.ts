import { IsArray, ValidateNested, IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RecordBoardingDto } from './fleet-and-trip.dto.js';

export class BatchBoardingCheckInDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecordBoardingDto)
  records!: RecordBoardingDto[];
}

export class QueryTransportAttendanceDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}
