import { IsNotEmpty, IsString, IsIn } from 'class-validator';

export class CorrectAttendanceDto {
  @IsNotEmpty()
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | string;

  @IsNotEmpty()
  @IsString()
  reason: string;
}
