import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsOptional()
  token?: string;

  @IsString()
  @IsOptional()
  @MinLength(6)
  newPassword?: string;
}
