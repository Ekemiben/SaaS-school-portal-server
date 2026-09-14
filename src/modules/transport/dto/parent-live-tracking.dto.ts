import { IsString, IsOptional } from 'class-validator';

export enum ParentLiveTrackingStatus {
  ACTIVE = 'ACTIVE',
  NOT_ENABLED = 'NOT_ENABLED',
  DISCONNECTED = 'DISCONNECTED',
  NO_ACTIVE_TRIP = 'NO_ACTIVE_TRIP',
  NO_ALLOCATION = 'NO_ALLOCATION',
}

export class QueryParentLiveTrackingDto {
  @IsOptional()
  @IsString()
  academicYearId?: string;
}
