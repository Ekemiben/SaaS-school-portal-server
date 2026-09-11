import { Controller, Get } from '@nestjs/common';
import { PermissionsService } from './permissions.service.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions(SystemPermissions.ROLES_MANAGE)
  getAllPermissions() {
    return this.permissionsService.getAllPermissions();
  }
}
