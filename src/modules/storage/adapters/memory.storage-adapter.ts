import { randomUUID } from 'crypto';
import type {
  IStorageAdapter,
  PresignedUploadOptions,
  PresignedUploadResult,
  PresignedDownloadOptions,
  StorageFileMetadata,
  StorageConfigOptions,
} from '../storage.interface.js';

interface StoredItem {
  buffer: Buffer;
  mimeType: string;
  size: number;
  metadata?: Record<string, string>;
  lastModified: Date;
  etag: string;
}

export class MemoryStorageAdapter implements IStorageAdapter {
  readonly provider = 'memory';
  private readonly items = new Map<string, StoredItem>();

  constructor(private readonly config?: Partial<StorageConfigOptions>) {}

  async getUploadPresignedUrl(options: PresignedUploadOptions): Promise<PresignedUploadResult> {
    const token = randomUUID().replace(/-/g, '');
    const expiresIn = options.expiresInSeconds || this.config?.presignedUrlExpiresSeconds || 900;
    const bucket = this.config?.bucket || 'dev-school-storage';
    const uploadUrl = `https://storage.local.schoolportal.internal/${bucket}/${options.key}?uploadToken=${token}&exp=${Date.now() + expiresIn * 1000}`;

    return {
      uploadUrl,
      storageKey: options.key,
      method: 'PUT',
      headers: {
        'Content-Type': options.mimeType,
        'x-tenant-id': options.tenantId,
      },
      expiresInSeconds: expiresIn,
    };
  }

  async getDownloadPresignedUrl(options: PresignedDownloadOptions): Promise<string> {
    const token = randomUUID().replace(/-/g, '');
    const expiresIn = options.expiresInSeconds || this.config?.presignedUrlExpiresSeconds || 900;
    const bucket = this.config?.bucket || 'dev-school-storage';
    const disp = options.dispositionFileName ? `&response-content-disposition=${encodeURIComponent(options.dispositionFileName)}` : '';

    return `https://storage.local.schoolportal.internal/${bucket}/${options.key}?downloadToken=${token}&exp=${Date.now() + expiresIn * 1000}${disp}`;
  }

  async uploadBuffer(
    key: string,
    buffer: Buffer,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    this.items.set(key, {
      buffer,
      mimeType: mimeType || 'application/octet-stream',
      size: buffer.length,
      metadata,
      lastModified: new Date(),
      etag: `"${randomUUID()}"`,
    });
  }

  async downloadBuffer(key: string): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    const item = this.items.get(key);
    if (!item) {
      throw new Error(`File asset not found in storage: ${key}`);
    }
    return {
      buffer: item.buffer,
      mimeType: item.mimeType,
      size: item.size,
    };
  }

  async deleteObject(key: string): Promise<boolean> {
    return this.items.delete(key);
  }

  async objectExists(key: string): Promise<boolean> {
    return this.items.has(key);
  }

  async getMetadata(key: string): Promise<StorageFileMetadata | null> {
    const item = this.items.get(key);
    if (!item) {
      return null;
    }
    return {
      key,
      sizeBytes: item.size,
      mimeType: item.mimeType,
      etag: item.etag,
      lastModified: item.lastModified,
      metadata: item.metadata,
    };
  }

  clear(): void {
    this.items.clear();
  }
}
