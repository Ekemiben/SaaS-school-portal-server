import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CloudflareR2StorageProvider } from './storage.provider.js';
import { ALLOWED_MIME_TYPES, ALLOWED_FILE_CATEGORIES, CATEGORY_SIZE_LIMITS, FileCategory } from './storage.constants.js';
import { PresignUploadDto } from './dto/file-upload.dto.js';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

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
    private readonly storageProvider: CloudflareR2StorageProvider,
  ) {}

  async listFiles(tenantId: string, filter?: { category?: string; limit?: number; offset?: number }) {
    const category = filter?.category;
    return this.prisma.fileAsset.findMany({
      where: {
        tenantId,
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
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
    } else if ((this.storageProvider as any).getUploadPresignedUrl) {
      presignedUpload = await (this.storageProvider as any).getUploadPresignedUrl(
        tenantId,
        category,
        dto.originalName,
        dto.mimeType,
        dto.sizeBytes,
      );
      presignedDownload = { downloadUrl: await (this.storageProvider as any).getDownloadPresignedUrl(tenantId, storageKey, dto.originalName) };
    }

    const fileData = await this.prisma.fileAsset.create({
      data: {
        id: fileId,
        tenantId,
        storageKey,
        originalName: dto.originalName,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        category,
        uploadedByUserId: userId,
      },
    });

    return {
      file: { ...fileData, status: 'PENDING_UPLOAD' },
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
    const file = await this.prisma.fileAsset.findFirst({
      where: { id: fileId, tenantId },
    });

    if (!file) {
      throw new NotFoundException('File asset not found in this school.');
    }

    let downloadUrl = `https://storage.local/download/${file.storageKey}`;
    let expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    if (this.storageProvider.generatePresignedDownload) {
      const presigned = await this.storageProvider.generatePresignedDownload(file.storageKey, file.originalName);
      downloadUrl = presigned.downloadUrl;
      expiresAt = presigned.expiresAt;
    } else if ((this.storageProvider as any).getDownloadPresignedUrl) {
      downloadUrl = await (this.storageProvider as any).getDownloadPresignedUrl(tenantId, file.storageKey, file.originalName);
    }

    return {
      ...file,
      downloadUrl,
      expiresAt,
    };
  }

  async confirmUpload(tenantId: string, fileId: string) {
    const file = await this.getFile(tenantId, fileId);

    let exists = true;
    if ((this.storageProvider as any).objectExists) {
      exists = await (this.storageProvider as any).objectExists(tenantId, file.storageKey);
    } else if ((this.storageProvider as any).getAdapter) {
      exists = await (this.storageProvider as any).getAdapter().objectExists(file.storageKey);
    }

    if (exists) {
      return { confirmed: true, status: 'READY', file: { ...file, status: 'READY' } };
    }

    return { confirmed: false, status: 'PENDING_UPLOAD', file: { ...file, status: 'PENDING_UPLOAD' } };
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
    const file = await this.prisma.fileAsset.findFirst({
      where: { id: fileId, tenantId },
    });

    if (!file) {
      throw new NotFoundException('File asset not found in this school.');
    }

    if (!file.storageKey.startsWith(`tenants/${tenantId}/`)) {
      throw new ForbiddenException('Unauthorized storage deletion attempt.');
    }

    if (this.storageProvider.deleteObject) {
      if ((this.storageProvider.deleteObject as any).length >= 2) {
        await (this.storageProvider as any).deleteObject(tenantId, file.storageKey);
      } else {
        await this.storageProvider.deleteObject(file.storageKey);
      }
    } else if ((this.storageProvider as any).getAdapter) {
      await (this.storageProvider as any).getAdapter().deleteObject(file.storageKey);
    }

    await this.prisma.fileAsset.delete({
      where: { id: fileId },
    });

    return { success: true, message: 'File asset deleted successfully' };
  }

  async saveUploadedFile(
    tenantId: string,
    userId: string,
    file: any,
    categoryName?: string,
  ) {
    if (!file || (!file.buffer && !file.data)) {
      throw new BadRequestException('No valid file content received');
    }

    const buffer = file.buffer || file.data;
    const category: FileCategory = (ALLOWED_FILE_CATEGORIES.includes(categoryName as any)
      ? categoryName
      : 'images') as FileCategory;

    const fileId = `file_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const originalName = file.originalname || file.name || 'uploaded_image.png';
    const sanitizedFileName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    const storageKey = `tenants/${tenantId}/${category}/${randomUUID().substring(0, 8)}-${sanitizedFileName}`;

    // Ensure uploads directory exists on disk
    const uploadsDir = path.join(process.cwd(), 'uploads', 'tenants', tenantId, category);
    fs.mkdirSync(uploadsDir, { recursive: true });

    const localFilename = `${fileId}_${sanitizedFileName}`;
    const localFilePath = path.join(uploadsDir, localFilename);
    fs.writeFileSync(localFilePath, buffer);

    const relativeUrl = `/uploads/tenants/${tenantId}/${category}/${localFilename}`;

    const fileData = await this.prisma.fileAsset.create({
      data: {
        id: fileId,
        tenantId,
        storageKey,
        originalName,
        mimeType: file.mimetype || 'image/png',
        sizeBytes: buffer.length,
        category,
        uploadedByUserId: userId,
      },
    });

    return {
      file: fileData,
      fileId,
      storageKey,
      url: relativeUrl,
      downloadUrl: relativeUrl,
    };
  }

  async uploadDirectImage(
    tenantId: string,
    userId: string,
    body: { base64Data?: string; dataUrl?: string; filename?: string; category?: string },
  ) {
    const raw = body.dataUrl || body.base64Data;
    if (!raw) {
      throw new BadRequestException('Image data is required (dataUrl or base64Data)');
    }

    let mimeType = 'image/png';
    let base64String = raw;

    const match = raw.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64String = match[2];
    }

    const buffer = Buffer.from(base64String, 'base64');
    const ext = mimeType.split('/')[1] || 'png';
    const originalName = body.filename || `image_${Date.now()}.${ext}`;

    return this.saveUploadedFile(
      tenantId,
      userId,
      {
        originalname: originalName,
        mimetype: mimeType,
        buffer,
      },
      body.category || 'images',
    );
  }
}
