import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CloudflareR2StorageProvider } from './storage.provider.js';
import { ALLOWED_MIME_TYPES, ALLOWED_FILE_CATEGORIES, CATEGORY_SIZE_LIMITS, FileCategory } from './storage.constants.js';
import { PresignUploadDto } from './dto/file-upload.dto.js';
import { randomUUID } from 'crypto';

export interface RegisterFileInput {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category?: string;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageProvider: any,
  ) {}

  async listFiles(tenantId: string, filter?: { category?: string; limit?: number; offset?: number }) {
    const category = filter?.category;
    if (this.prisma.isDbConnected && (this.prisma as any).fileAsset) {
      try {
        return await (this.prisma as any).fileAsset.findMany({
          where: {
            tenantId,
            ...(category ? { category } : {}),
          },
          orderBy: { createdAt: 'desc' },
        });
      } catch {}
    }

    return Array.from(this.prisma.memoryStore.fileAssets.values()).filter(
      (f) => f.tenantId === tenantId && (!category || f.category === category),
    );
  }

  async registerFile(
    tenantId: string,
    userId: string,
    dto: RegisterFileInput,
  ) {
    if (!dto.originalName || !dto.originalName.trim()) {
      throw new BadRequestException('originalName is required');
    }
    if (!dto.mimeType || !ALLOWED_MIME_TYPES.has(dto.mimeType) || dto.mimeType === 'application/x-msdownload' || dto.originalName.endsWith('.exe')) {
      throw new BadRequestException(`Unsupported MIME type: "${dto.mimeType}". Allowed types include documents, images, and archives.`);
    }
    if (!dto.sizeBytes || dto.sizeBytes <= 0) {
      throw new BadRequestException('sizeBytes must be greater than 0');
    }

    const category: FileCategory = (ALLOWED_FILE_CATEGORIES.includes(dto.category as any)
      ? dto.category
      : 'documents') as FileCategory;

    const maxAllowedSize = CATEGORY_SIZE_LIMITS[category] || 25 * 1024 * 1024;
    if (dto.sizeBytes > maxAllowedSize) {
      throw new BadRequestException(`File size (${dto.sizeBytes} bytes) exceeds maximum allowed limit of ${maxAllowedSize} bytes for category "${category}".`);
    }

    const sanitizedFileName = dto.originalName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    const fileId = `file_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const storageKey = `tenants/${tenantId}/${category}/${randomUUID().substring(0, 8)}-${sanitizedFileName}`;

    let presignedUpload: any = { uploadUrl: `https://storage.local/upload?uploadToken=${fileId}` };
    let presignedDownload: any = { downloadUrl: `https://storage.local/download?downloadToken=${fileId}` };

    if (this.storageProvider.generatePresignedUpload) {
      presignedUpload = await this.storageProvider.generatePresignedUpload(
        storageKey,
        dto.mimeType,
        dto.sizeBytes,
        { tenantId, uploadedBy: userId },
      );
      presignedDownload = await this.storageProvider.generatePresignedDownload(storageKey, dto.originalName);
    } else if (this.storageProvider.getUploadPresignedUrl) {
      presignedUpload = await this.storageProvider.getUploadPresignedUrl(
        tenantId,
        category,
        dto.originalName,
        dto.mimeType,
        dto.sizeBytes,
      );
      presignedDownload = { downloadUrl: await this.storageProvider.getDownloadPresignedUrl(tenantId, storageKey, dto.originalName) };
    }

    const fileData = {
      id: fileId,
      tenantId,
      storageKey,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      category,
      status: 'PENDING_UPLOAD',
      uploadedByUserId: userId,
      createdAt: new Date(),
    };

    if (this.prisma.isDbConnected && (this.prisma as any).fileAsset) {
      try {
        await (this.prisma as any).fileAsset.create({
          data: {
            id: fileId,
            tenantId,
            storageKey,
            originalName: dto.originalName,
            mimeType: dto.mimeType,
            sizeBytes: dto.sizeBytes,
            category,
            uploadedByUserId: userId,
            createdAt: new Date(),
          },
        });
      } catch {}
    }

    this.prisma.memoryStore.fileAssets.set(fileId, fileData);

    return {
      file: fileData,
      fileId,
      storageKey,
      uploadUrl: presignedUpload.uploadUrl,
      downloadUrl: presignedDownload.downloadUrl,
      method: 'PUT',
      expiresAt: presignedUpload.expiresAt,
    };
  }

  async registerAndPresignUpload(
    tenantId: string,
    userId: string,
    dto: PresignUploadDto,
  ) {
    return this.registerFile(tenantId, userId, dto);
  }

  async getFile(tenantId: string, fileId: string) {
    let file: any = null;
    if (this.prisma.isDbConnected && (this.prisma as any).fileAsset) {
      try {
        file = await (this.prisma as any).fileAsset.findUnique({ where: { id: fileId } });
      } catch {}
    }
    if (!file) {
      file = this.prisma.memoryStore.fileAssets.get(fileId);
    }

    if (!file || file.tenantId !== tenantId) {
      throw new NotFoundException('File asset not found in this school.');
    }

    let downloadUrl = `https://storage.local/download/${file.storageKey}`;
    let expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    if (this.storageProvider.generatePresignedDownload) {
      const presigned = await this.storageProvider.generatePresignedDownload(file.storageKey, file.originalName);
      downloadUrl = presigned.downloadUrl;
      expiresAt = presigned.expiresAt;
    } else if (this.storageProvider.getDownloadPresignedUrl) {
      downloadUrl = await this.storageProvider.getDownloadPresignedUrl(tenantId, file.storageKey, file.originalName);
    }

    return {
      ...file,
      downloadUrl,
      expiresAt,
    };
  }

  async confirmUpload(tenantId: string, fileId: string) {
    const file = await this.getFile(tenantId, fileId);

    let exists = false;
    if (this.storageProvider.objectExists) {
      exists = await this.storageProvider.objectExists(tenantId, file.storageKey);
    } else if (this.storageProvider.getAdapter) {
      exists = await this.storageProvider.getAdapter().objectExists(file.storageKey);
    }

    if (exists) {
      file.status = 'READY';
      if (this.prisma.isDbConnected && (this.prisma as any).fileAsset) {
        try {
          await (this.prisma as any).fileAsset.update({ where: { id: fileId }, data: { status: 'READY' } });
        } catch {}
      }
      this.prisma.memoryStore.fileAssets.set(fileId, file);
      return { confirmed: true, status: 'READY', file };
    }

    return { confirmed: false, status: 'PENDING_UPLOAD', file };
  }

  async getPresignedDownload(tenantId: string, fileId: string) {
    const file = await this.getFile(tenantId, fileId);
    return {
      file,
      downloadUrl: file.downloadUrl,
      expiresAt: file.expiresAt,
    };
  }

  async deleteFile(tenantId: string, fileId: string) {
    let file: any = null;

    if (this.prisma.isDbConnected && (this.prisma as any).fileAsset) {
      try {
        file = await (this.prisma as any).fileAsset.findUnique({ where: { id: fileId } });
      } catch {}
    }
    if (!file) {
      file = this.prisma.memoryStore.fileAssets.get(fileId);
    }

    if (!file || file.tenantId !== tenantId) {
      throw new NotFoundException('File asset not found in this school.');
    }

    if (!file.storageKey.startsWith(`tenants/${tenantId}/`)) {
      throw new ForbiddenException('Unauthorized storage deletion attempt.');
    }

    if (this.storageProvider.deleteObject) {
      await this.storageProvider.deleteObject(tenantId, file.storageKey);
    } else if (this.storageProvider.getAdapter) {
      await this.storageProvider.getAdapter().deleteObject(file.storageKey);
    }

    if (this.prisma.isDbConnected && (this.prisma as any).fileAsset) {
      try {
        await (this.prisma as any).fileAsset.delete({ where: { id: fileId } });
      } catch {}
    }
    this.prisma.memoryStore.fileAssets.delete(fileId);

    return { success: true, message: 'File asset deleted successfully' };
  }
}
