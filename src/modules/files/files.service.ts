import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async listFiles(tenantId: string, category?: string) {
    return Array.from(this.prisma.memoryStore.fileAssets.values()).filter(
      (f) => f.tenantId === tenantId && (!category || f.category === category),
    );
  }

  async registerFile(
    tenantId: string,
    userId: string,
    data: {
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      category?: string;
    },
  ) {
    const category = data.category || 'documents';
    const fileId = `file_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    // Section 34: Strict tenant-prefixed storage key
    const storageKey = `tenants/${tenantId}/${category}/${randomUUID()}-${data.originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const asset = {
      id: fileId,
      tenantId,
      storageKey,
      originalName: data.originalName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      category,
      uploadedByUserId: userId,
      createdAt: new Date(),
    };

    this.prisma.memoryStore.fileAssets.set(fileId, asset);

    return {
      file: asset,
      uploadUrl: `https://storage.schoolportal.io/upload/${storageKey}`,
      downloadUrl: `https://storage.schoolportal.io/${storageKey}`,
    };
  }

  async getFile(tenantId: string, fileId: string) {
    const file = this.prisma.memoryStore.fileAssets.get(fileId);
    if (!file || file.tenantId !== tenantId) {
      throw new NotFoundException('File asset not found in this school');
    }
    return {
      ...file,
      downloadUrl: `https://storage.schoolportal.io/${file.storageKey}`,
    };
  }
}
