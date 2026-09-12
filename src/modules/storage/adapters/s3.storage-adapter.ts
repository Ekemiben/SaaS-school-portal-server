import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  IStorageAdapter,
  PresignedUploadOptions,
  PresignedUploadResult,
  PresignedDownloadOptions,
  StorageFileMetadata,
  StorageConfigOptions,
} from '../storage.interface.js';

export class S3StorageAdapter implements IStorageAdapter {
  readonly provider = 's3';
  private client: S3Client | null = null;

  constructor(private readonly config: StorageConfigOptions) {}

  private getClient(): S3Client {
    if (!this.client) {
      const clientConfig: any = {
        region: this.config.region || 'us-east-1',
      };

      if (this.config.accessKeyId && this.config.secretAccessKey) {
        clientConfig.credentials = {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        };
      }

      if (this.config.endpoint) {
        clientConfig.endpoint = this.config.endpoint;
        clientConfig.forcePathStyle = true;
      }

      this.client = new S3Client(clientConfig);
    }
    return this.client;
  }

  async getUploadPresignedUrl(options: PresignedUploadOptions): Promise<PresignedUploadResult> {
    const s3 = this.getClient();
    const expiresIn = options.expiresInSeconds || this.config.presignedUrlExpiresSeconds || 900;

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: options.key,
      ContentType: options.mimeType,
      Metadata: {
        tenant_id: options.tenantId,
        ...options.metadata,
      },
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn });

    return {
      uploadUrl,
      storageKey: options.key,
      method: 'PUT',
      headers: {
        'Content-Type': options.mimeType,
      },
      expiresInSeconds: expiresIn,
    };
  }

  async getDownloadPresignedUrl(options: PresignedDownloadOptions): Promise<string> {
    const s3 = this.getClient();
    const expiresIn = options.expiresInSeconds || this.config.presignedUrlExpiresSeconds || 900;

    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: options.key,
      ResponseContentDisposition: options.dispositionFileName
        ? `attachment; filename="${encodeURIComponent(options.dispositionFileName)}"`
        : undefined,
    });

    return getSignedUrl(s3, command, { expiresIn });
  }

  async uploadBuffer(
    key: string,
    buffer: Buffer,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const s3 = this.getClient();
    await s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        Metadata: metadata,
      }),
    );
  }

  async downloadBuffer(key: string): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    const s3 = this.getClient();
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }),
    );

    const stream = response.Body as any;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const buffer = Buffer.concat(chunks);

    return {
      buffer,
      mimeType: response.ContentType || 'application/octet-stream',
      size: response.ContentLength || buffer.length,
    };
  }

  async deleteObject(key: string): Promise<boolean> {
    const s3 = this.getClient();
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async objectExists(key: string): Promise<boolean> {
    const s3 = this.getClient();
    try {
      await s3.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async getMetadata(key: string): Promise<StorageFileMetadata | null> {
    const s3 = this.getClient();
    try {
      const response = await s3.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );

      return {
        key,
        sizeBytes: response.ContentLength || 0,
        mimeType: response.ContentType || 'application/octet-stream',
        etag: response.ETag,
        lastModified: response.LastModified,
        metadata: response.Metadata,
      };
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }
}
