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
  private client: any = null;

  constructor(private readonly config: StorageConfigOptions) {}

  private async getClient(): Promise<any> {
    if (!this.client) {
      try {
        const { Storage } = await import('@google-cloud/storage' as any);
        const options: any = {};
        if (this.config.gcsProjectId) {
          options.projectId = this.config.gcsProjectId;
        }
        if (this.config.gcsKeyFilename) {
          options.keyFilename = this.config.gcsKeyFilename;
        }
        this.client = new Storage(options);
      } catch (err: any) {
        throw new Error(`Google Cloud Storage SDK (@google-cloud/storage) is not available: ${err?.message}`);
      }
    }
    return this.client;
  }

  private async getBucket(): Promise<any> {
    const client = await this.getClient();
    return client.bucket(this.config.bucket);
  }

  async getUploadPresignedUrl(options: PresignedUploadOptions): Promise<PresignedUploadResult> {
    const bucket = await this.getBucket();
    const file = bucket.file(options.key);
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
    const bucket = await this.getBucket();
    const file = bucket.file(options.key);
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
    const bucket = await this.getBucket();
    const file = bucket.file(key);
    await file.save(buffer, {
      contentType: mimeType,
      metadata: {
        metadata,
      },
    });
  }

  async downloadBuffer(key: string): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    const bucket = await this.getBucket();
    const file = bucket.file(key);
    const [data] = await file.download();
    const [meta] = await file.getMetadata();

    return {
      buffer: data,
      mimeType: (meta.contentType as string) || 'application/octet-stream',
      size: Number(meta.size) || data.length,
    };
  }

  async deleteObject(key: string): Promise<boolean> {
    const bucket = await this.getBucket();
    const file = bucket.file(key);
    try {
      await file.delete();
      return true;
    } catch {
      return false;
    }
  }

  async objectExists(key: string): Promise<boolean> {
    const bucket = await this.getBucket();
    const file = bucket.file(key);
    try {
      const [exists] = await file.exists();
      return exists;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<StorageFileMetadata | null> {
    const bucket = await this.getBucket();
    const file = bucket.file(key);
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
