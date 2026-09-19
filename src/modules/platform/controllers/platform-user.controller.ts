import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { PlatformUserService } from '../services/platform-user.service.js';
import {
  CreatePlatformUserDto,
  UpdatePlatformUserStatusDto,
  UpdatePlatformUserPermissionsDto,
  UpdatePlatformUserRoleDto,
  ResetPlatformUserPasswordDto,
  PlatformUserFilterDto,
} from '../dto/platform-user.dto.js';
import { AuthGuard } from '../../../common/guards/auth.guard.js';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard.js';
import { PermissionsGuard } from '../../../common/guards/permissions.guard.js';

@Controller('api/v1/platform/users')
@UseGuards(AuthGuard, PlatformAdminGuard, PermissionsGuard)
export class PlatformUserController {
  constructor(private readonly platformUserService: PlatformUserService) {}

  @Post()
  @RequirePermissions(SystemPermissions.PLATFORM_USER_CREATE)
  createPlatformUser(
    @CurrentUser() user: any,
    @Body() dto: CreatePlatformUserDto,
  ) {
    return this.platformUserService.createPlatformUser(user, dto);
  }

  @Get()
  @RequirePermissions(SystemPermissions.PLATFORM_USER_VIEW)
  listPlatformUsers(@Query() filter: PlatformUserFilterDto) {
    return this.platformUserService.listPlatformUsers(filter);
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.PLATFORM_USER_VIEW)
  getPlatformUser(@Param('id') id: string) {
    return this.platformUserService.getPlatformUser(id);
  }

  @Patch(':id/status')
  @RequirePermissions(SystemPermissions.PLATFORM_USER_DEACTIVATE)
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdatePlatformUserStatusDto,
  ) {
    return this.platformUserService.updateStatus(user, id, dto);
  }

  @Patch(':id/permissions')
  @RequirePermissions(SystemPermissions.PLATFORM_PERMISSION_ASSIGN)
  updatePermissions(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdatePlatformUserPermissionsDto,
  ) {
    return this.platformUserService.updatePermissions(user, id, dto);
  }

  @Patch(':id/role')
  @RequirePermissions(SystemPermissions.PLATFORM_ROLE_ASSIGN)
  updateRole(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdatePlatformUserRoleDto,
  ) {
    return this.platformUserService.updateRole(user, id, dto);
  }

  @Patch(':id/reset-password')
  @RequirePermissions(SystemPermissions.PLATFORM_USER_CREATE)
  resetPassword(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: ResetPlatformUserPasswordDto,
  ) {
    return this.platformUserService.resetPassword(user, id, dto);
  }
}
