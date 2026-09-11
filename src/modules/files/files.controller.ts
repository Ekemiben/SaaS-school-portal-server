import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { FilesService } from './files.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Get()
  async listFiles(
    @CurrentTenant() tenant: TenantContext,
    @Query('category') category?: string,
  ) {
    return this.filesService.listFiles(tenant.tenantId, category);
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Post('presign-upload')
  async presignUpload(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.filesService.registerFile(tenant.tenantId, user?.id || 'sys_user', body);
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Get(':id')
  async getFile(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.filesService.getFile(tenant.tenantId, id);
  }
}
