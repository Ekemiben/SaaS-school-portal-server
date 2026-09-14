import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CloudflareR2StorageProvider } from './storage.provider.js';
import { ALLOWED_MIME_TYPES, ALLOWED_FILE_CATEGORIES, CATEGORY_SIZE_LIMITS, FileCategory } from './storage.constants.js';
import { PresignUploadDto } from './dto/file-upload.dto.js';
import { randomUUID } from 'crypto';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageProvider: CloudflareR2StorageProvider,
  ) {}

  async listFiles(tenantId: string, category?: string) {
    if (this.prisma.isDbConnected) {
      return this.prisma.fileAsset.findMany({
        where: {
          tenantId,
          ...(category ? { category } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return Array.from(this.prisma.memoryStore.fileAssets.values()).filter(
      (f) => f.tenantId === tenantId && (!category || f.category === category),
    );
  }

  async registerAndPresignUpload(
    tenantId: string,
    userId: string,
    dto: PresignUploadDto,
  ) {
    // 1. MIME-type validation
    if (!ALLOWED_MIME_TYPES.has(dto.mimeType)) {
      throw new BadRequestException(`Unsupported MIME type: "${dto.mimeType}". Allowed types include documents, images, and archives.`);
    }

    // 2. Category validation & size limit
    const category: FileCategory = (ALLOWED_FILE_CATEGORIES.includes(dto.category as any)
      ? dto.category
      : 'documents') as FileCategory;

    const maxAllowedSize = CATEGORY_SIZE_LIMITS[category] || 25 * 1024 * 1024;
    if (dto.sizeBytes > maxAllowedSize) {
      throw new BadRequestException(`File size (${dto.sizeBytes} bytes) exceeds maximum allowed limit of ${maxAllowedSize} bytes for category "${category}".`);
    }

    // 3. Strict Tenant-Scoped Key Path
    const sanitizedFileName = dto.originalName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    const fileId = `file_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const storageKey = `tenants/${tenantId}/${category}/${randomUUID()}-${sanitizedFileName}`;

    // 4. Generate Presigned Upload URL
    const presigned = await this.storageProvider.generatePresignedUpload(
      storageKey,
      dto.mimeType,
      dto.sizeBytes,
      { tenantId, uploadedBy: userId },
    );

    // 5. Persist File Record
    const fileData = {
      id: fileId,
      tenantId,
      storageKey,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      category,
      uploadedByUserId: userId,
      createdAt: new Date(),
    };

    if (this.prisma.isDbConnected) {
      await this.prisma.fileAsset.create({ data: fileData });
    } else {
      this.prisma.memoryStore.fileAssets.set(fileId, fileData);
    }

    return {
      fileId,
      storageKey,
      uploadUrl: presigned.uploadUrl,
      expiresAt: presigned.expiresAt,
    };
  }

  async getPresignedDownload(tenantId: string, fileId: string) {
    let file: any = null;

    if (this.prisma.isDbConnected) {
      file = await this.prisma.fileAsset.findUnique({ where: { id: fileId } });
    } else {
      file = this.prisma.memoryStore.fileAssets.get(fileId);
    }

    if (!file || file.tenantId !== tenantId) {
      throw new NotFoundException('File asset not found in this school.');
    }

    // Strict validation: storageKey must strictly match tenant prefix
    if (!file.storageKey.startsWith(`tenants/${tenantId}/`)) {
      this.logger.error(`Security alert: Cross-tenant key mismatch detected for file ${fileId}`);
      throw new ForbiddenException('Access to cross-tenant storage object is forbidden.');
    }

    const presigned = await this.storageProvider.generatePresignedDownload(file.storageKey, file.originalName);

    return {
      file,
      downloadUrl: presigned.downloadUrl,
      expiresAt: presigned.expiresAt,
    };
  }

  async deleteFile(tenantId: string, fileId: string) {
    let file: any = null;

    if (this.prisma.isDbConnected) {
      file = await this.prisma.fileAsset.findUnique({ where: { id: fileId } });
    } else {
      file = this.prisma.memoryStore.fileAssets.get(fileId);
    }

    if (!file || file.tenantId !== tenantId) {
      throw new NotFoundException('File asset not found in this school.');
    }

    if (!file.storageKey.startsWith(`tenants/${tenantId}/`)) {
      throw new ForbiddenException('Unauthorized storage deletion attempt.');
    }

    await this.storageProvider.deleteObject(file.storageKey);

    if (this.prisma.isDbConnected) {
      await this.prisma.fileAsset.delete({ where: { id: fileId } });
    } else {
      this.prisma.memoryStore.fileAssets.delete(fileId);
    }

    return { success: true, message: 'File asset deleted successfully' };
  }
}
