import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { randomUUID } from 'crypto';

export interface RegisterFileInput {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category?: string;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async listFiles(tenantId: string, options?: { category?: string; limit?: number; offset?: number }) {
    const category = options?.category;
    let list: any[] = [];

    if (this.prisma.isPostgresConnected()) {
      try {
        list = await (this.prisma as any).fileAsset.findMany({
          where: {
            tenantId,
            ...(category ? { category } : {}),
          },
          take: options?.limit || 50,
          skip: options?.offset || 0,
          orderBy: { createdAt: 'desc' },
        });
      } catch {
        list = this.getFromMemoryStore(tenantId, category);
      }
    } else {
      list = this.getFromMemoryStore(tenantId, category);
    }

    // Attach fresh presigned download URLs
    return Promise.all(
      list.map(async (f) => ({
        ...f,
        downloadUrl: await this.storageService.getDownloadPresignedUrl(tenantId, f.storageKey, f.originalName),
      })),
    );
  }

  private getFromMemoryStore(tenantId: string, category?: string) {
    return Array.from(this.prisma.memoryStore.fileAssets.values())
      .filter((f: any) => f.tenantId === tenantId && (!category || f.category === category))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async registerFile(tenantId: string, userId: string, data: RegisterFileInput) {
    if (!data.originalName || !data.mimeType || !data.sizeBytes) {
      throw new BadRequestException('originalName, mimeType, and sizeBytes are required.');
    }

    const category = data.category || 'documents';
    const presigned = await this.storageService.getUploadPresignedUrl(
      tenantId,
      category,
      data.originalName,
      data.mimeType,
      data.sizeBytes,
    );

    const fileId = `file_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const asset = {
      id: fileId,
      tenantId,
      storageKey: presigned.storageKey,
      originalName: data.originalName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      category,
      status: 'PENDING_UPLOAD',
      uploadedByUserId: userId,
      createdAt: new Date(),
    };

    if (this.prisma.isPostgresConnected()) {
      try {
        await (this.prisma as any).fileAsset.create({
          data: {
            id: asset.id,
            tenantId: asset.tenantId,
            storageKey: asset.storageKey,
            originalName: asset.originalName,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            category: asset.category,
            uploadedByUserId: asset.uploadedByUserId,
            createdAt: asset.createdAt,
          },
        });
      } catch {
        this.prisma.memoryStore.fileAssets.set(fileId, asset);
      }
    } else {
      this.prisma.memoryStore.fileAssets.set(fileId, asset);
    }

    const downloadUrl = await this.storageService.getDownloadPresignedUrl(
      tenantId,
      presigned.storageKey,
      data.originalName,
    );

    return {
      file: asset,
      uploadUrl: presigned.uploadUrl,
      storageKey: presigned.storageKey,
      method: presigned.method,
      headers: presigned.headers,
      expiresInSeconds: presigned.expiresInSeconds,
      downloadUrl,
    };
  }

  async confirmUpload(tenantId: string, fileId: string) {
    const file = await this.findFile(tenantId, fileId);
    const exists = await this.storageService.objectExists(tenantId, file.storageKey);

    if (exists) {
      file.status = 'READY';
      if (this.prisma.isPostgresConnected()) {
        try {
          await (this.prisma as any).fileAsset.update({
            where: { id: fileId },
            data: { status: 'READY' },
          });
        } catch {
          this.prisma.memoryStore.fileAssets.set(fileId, file);
        }
      } else {
        this.prisma.memoryStore.fileAssets.set(fileId, file);
      }
    }

    return {
      fileId,
      confirmed: exists,
      status: exists ? 'READY' : 'PENDING_UPLOAD',
      downloadUrl: await this.storageService.getDownloadPresignedUrl(tenantId, file.storageKey, file.originalName),
    };
  }

  async getFile(tenantId: string, fileId: string) {
    const file = await this.findFile(tenantId, fileId);
    const downloadUrl = await this.storageService.getDownloadPresignedUrl(
      tenantId,
      file.storageKey,
      file.originalName,
    );
    return {
      ...file,
      downloadUrl,
    };
  }

  async deleteFile(tenantId: string, fileId: string) {
    const file = await this.findFile(tenantId, fileId);
    await this.storageService.deleteObject(tenantId, file.storageKey);

    if (this.prisma.isPostgresConnected()) {
      try {
        await (this.prisma as any).fileAsset.delete({ where: { id: fileId } });
      } catch {
        this.prisma.memoryStore.fileAssets.delete(fileId);
      }
    } else {
      this.prisma.memoryStore.fileAssets.delete(fileId);
    }

    return { success: true, deletedFileId: fileId };
  }

  async downloadDirectBuffer(tenantId: string, fileId: string) {
    const file = await this.findFile(tenantId, fileId);
    const result = await this.storageService.downloadBuffer(tenantId, file.storageKey);
    return {
      ...result,
      originalName: file.originalName,
    };
  }

  private async findFile(tenantId: string, fileId: string) {
    let file: any = null;
    if (this.prisma.isPostgresConnected()) {
      try {
        file = await (this.prisma as any).fileAsset.findUnique({ where: { id: fileId } });
      } catch {
        file = this.prisma.memoryStore.fileAssets.get(fileId);
      }
    } else {
      file = this.prisma.memoryStore.fileAssets.get(fileId);
    }

    if (!file || file.tenantId !== tenantId) {
      throw new NotFoundException(`File asset [${fileId}] not found in this school.`);
    }
    return file;
  }
}
