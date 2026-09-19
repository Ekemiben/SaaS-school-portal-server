import {
  IsEmail,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  MinLength,
} from 'class-validator';

export class CreatePlatformUserDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  @IsIn(['PLATFORM_ADMIN', 'PLATFORM_SUPPORT'])
  role!: 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdatePlatformUserStatusDto {
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdatePlatformUserPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

export class UpdatePlatformUserRoleDto {
  @IsString()
  @IsIn(['PLATFORM_ADMIN', 'PLATFORM_SUPPORT'])
  role!: 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT';
}

export class ResetPlatformUserPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class PlatformUserFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
