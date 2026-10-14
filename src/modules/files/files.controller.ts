import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service.js';
import { PresignUploadDto } from './dto/file-upload.dto.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ListFilesDto } from './dto/list-files.dto.js';

@Controller(['files', 'api/v1/files'])
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

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadFile(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Body('category') category?: string,
  ) {
    return this.filesService.saveUploadedFile(
      tenant.tenantId,
      user?.id || 'sys_user',
      file,
      category,
      tenant.slug,
    );
  }

  @Post('upload-image')
  async uploadImage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.filesService.uploadDirectImage(
      tenant.tenantId,
      user?.id || 'sys_user',
      body,
      tenant.slug,
    );
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Post('presign-upload')
  async presignUpload(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: PresignUploadDto,
  ) {
    return this.filesService.registerAndPresignUpload(
      tenant.tenantId,
      user?.id || 'sys_user',
      dto,
      tenant.slug,
    );
  }

  @Public()
  @Get('view/:id')
  async viewFile(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    let tenantContext =
      req.tenantContext ||
      req.tenant ||
      (req.user?.tenantId ? { tenantId: req.user.tenantId, slug: req.user.tenantSlug } : null);
    let isSuperAdmin = Boolean(req.user?.isPlatformAdmin || req.user?.role === 'SUPER_ADMIN');

    // Extract tenant from accessToken cookie if present (browser <img> tag same-origin requests)
    if (!tenantContext && req.cookies?.accessToken) {
      try {
        const parts = String(req.cookies.accessToken).split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload?.tenantId) {
            tenantContext = { tenantId: payload.tenantId, slug: payload.tenantSlug };
          }
          if (payload?.isPlatformAdmin || payload?.role === 'SUPER_ADMIN') {
            isSuperAdmin = true;
          }
        }
      } catch {}
    }

    // Check query param fallback (?tenantId=...)
    if (!tenantContext && req.query?.tenantId) {
      tenantContext = { tenantId: String(req.query.tenantId) };
    }

    const { buffer, mimeType, isPublic } = await this.filesService.viewFileAsset(
      tenantContext,
      id,
      isSuperAdmin,
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Cache-Control',
      isPublic ? 'public, max-age=86400, immutable' : 'private, max-age=3600',
    );
    res.send(buffer);
  }

  @Public()
  @Get('public/:id')
  async viewPublicFile(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType } = await this.filesService.viewFileAsset(null, id, true);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.send(buffer);
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Get(':id/presign-download')
  async getPresignedDownload(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.filesService.getPresignedDownload(tenant.tenantId, id, tenant.slug);
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Post(':id/confirm')
  async confirmUpload(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.filesService.confirmUpload(tenant.tenantId, id, tenant.slug);
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Get(':id')
  async getFile(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.filesService.getFile(tenant.tenantId, id, tenant.slug);
  }

  @RequirePermissions(SystemPermissions.FILES_MANAGE)
  @Get(':id/download-url')
  async getDownloadUrl(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    const file = await this.filesService.getFile(tenant.tenantId, id, tenant.slug);
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
    return this.filesService.deleteFile(tenant.tenantId, id, tenant.slug);
  }
}
