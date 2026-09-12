import { Storage } from '@google-cloud/storage';
import type {
  IStorageAdapter,
  PresignedUploadOptions,
  PresignedUploadResult,
  PresignedDownloadOptions,
  StorageFileMetadata,
  StorageConfigOptions,
} from '../storage.interface.js';

export class GCSStorageAdapter implements IStorageAdapter {
  readonly provider = 'gcs';
  private client: Storage | null = null;

  constructor(private readonly config: StorageConfigOptions) {}

  private getClient(): Storage {
    if (!this.client) {
      const options: any = {};
      if (this.config.gcsProjectId) {
        options.projectId = this.config.gcsProjectId;
      }
      if (this.config.gcsKeyFilename) {
        options.keyFilename = this.config.gcsKeyFilename;
      }
      this.client = new Storage(options);
    }
    return this.client;
  }

  private getBucket() {
    return this.getClient().bucket(this.config.bucket);
  }

  async getUploadPresignedUrl(options: PresignedUploadOptions): Promise<PresignedUploadResult> {
    const file = this.getBucket().file(options.key);
    const expiresIn = options.expiresInSeconds || this.config.presignedUrlExpiresSeconds || 900;
    const expires = Date.now() + expiresIn * 1000;

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires,
      contentType: options.mimeType,
      extensionHeaders: {
        'x-goog-meta-tenant-id': options.tenantId,
      },
    });

    return {
      uploadUrl,
      storageKey: options.key,
      method: 'PUT',
      headers: {
        'Content-Type': options.mimeType,
        'x-goog-meta-tenant-id': options.tenantId,
      },
      expiresInSeconds: expiresIn,
    };
  }

  async getDownloadPresignedUrl(options: PresignedDownloadOptions): Promise<string> {
    const file = this.getBucket().file(options.key);
    const expiresIn = options.expiresInSeconds || this.config.presignedUrlExpiresSeconds || 900;
    const expires = Date.now() + expiresIn * 1000;

    const config: any = {
      version: 'v4',
      action: 'read',
      expires,
    };

    if (options.dispositionFileName) {
      config.responseDisposition = `attachment; filename="${encodeURIComponent(options.dispositionFileName)}"`;
    }

    const [downloadUrl] = await file.getSignedUrl(config);
    return downloadUrl;
  }

  async uploadBuffer(
    key: string,
    buffer: Buffer,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const file = this.getBucket().file(key);
    await file.save(buffer, {
      contentType: mimeType,
      metadata: {
        metadata,
      },
    });
  }

  async downloadBuffer(key: string): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    const file = this.getBucket().file(key);
    const [data] = await file.download();
    const [meta] = await file.getMetadata();

    return {
      buffer: data,
      mimeType: (meta.contentType as string) || 'application/octet-stream',
      size: Number(meta.size) || data.length,
    };
  }

  async deleteObject(key: string): Promise<boolean> {
    const file = this.getBucket().file(key);
    try {
      await file.delete();
      return true;
    } catch {
      return false;
    }
  }

  async objectExists(key: string): Promise<boolean> {
    const file = this.getBucket().file(key);
    try {
      const [exists] = await file.exists();
      return exists;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<StorageFileMetadata | null> {
    const file = this.getBucket().file(key);
    try {
      const [meta] = await file.getMetadata();
      return {
        key,
        sizeBytes: Number(meta.size) || 0,
        mimeType: (meta.contentType as string) || 'application/octet-stream',
        etag: meta.etag,
        lastModified: meta.updated ? new Date(meta.updated as string) : undefined,
        metadata: (meta.metadata as Record<string, string>) || {},
      };
    } catch {
      return null;
    }
  }
}
