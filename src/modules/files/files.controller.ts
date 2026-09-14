import { Controller, Get, Post, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { FilesService } from './files.service.js';
import { PresignUploadDto } from './dto/file-upload.dto.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { ListFilesDto } from './dto/list-files.dto.js';

@Controller('api/v1/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Get()
  async listFiles(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListFilesDto,
  ) {
    return this.filesService.listFiles(tenant.tenantId, {
      category: query.category,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Post('presign-upload')
  async presignUpload(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: PresignUploadDto,
  ) {
    return this.filesService.registerAndPresignUpload(tenant.tenantId, user?.id || 'sys_user', dto);
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Get(':id/presign-download')
  async getPresignedDownload(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.filesService.getPresignedDownload(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Post(':id/confirm')
  async confirmUpload(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.filesService.confirmUpload(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Get(':id')
  async getFile(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.filesService.getFile(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Get(':id/download-url')
  async getDownloadUrl(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    const file = await this.filesService.getFile(tenant.tenantId, id);
    return {
      fileId: file.id,
      storageKey: file.storageKey,
      downloadUrl: file.downloadUrl,
    };
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteFile(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.filesService.deleteFile(tenant.tenantId, id);
  }
}
