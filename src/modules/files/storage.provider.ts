import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresAt: string;
}

@Injectable()
export class CloudflareR2StorageProvider implements OnModuleInit {
  private readonly logger = new Logger(CloudflareR2StorageProvider.name);
  private s3Client: S3Client | null = null;
  public isStorageConfigured = false;

  private bucket: string = 'school-saas-documents';
  private endpoint?: string;
  private uploadExpiresIn: number = 900;
  private downloadExpiresIn: number = 3600;

  onModuleInit() {
    this.bucket = process.env.STORAGE_BUCKET || process.env.CLOUDFLARE_R2_BUCKET || 'school-saas-documents';
    this.endpoint = process.env.STORAGE_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT;
    const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
    const region = process.env.STORAGE_REGION || process.env.CLOUDFLARE_R2_REGION || 'auto';

    this.uploadExpiresIn = parseInt(process.env.STORAGE_PRESIGNED_UPLOAD_EXPIRES || '900', 10);
    this.downloadExpiresIn = parseInt(process.env.STORAGE_PRESIGNED_DOWNLOAD_EXPIRES || '3600', 10);

    if (accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region,
        endpoint: this.endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        forcePathStyle: true,
      });
      this.isStorageConfigured = true;
      this.logger.log(`Initialized Cloudflare R2 / S3 storage client for bucket: "${this.bucket}"`);
    } else {
      this.isStorageConfigured = false;
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('Critical: Cloudflare R2 / S3 storage credentials not configured in production mode.');
      } else {
        this.logger.warn('Cloudflare R2 storage credentials not found. Operating with secure simulation provider for local/test.');
      }
    }
  }

  async generatePresignedUpload(
    storageKey: string,
    mimeType: string,
    sizeBytes: number,
    metadata?: Record<string, string>,
  ): Promise<PresignedUploadResult> {
    const expiresAt = new Date(Date.now() + this.uploadExpiresIn * 1000).toISOString();

    if (this.isStorageConfigured && this.s3Client) {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: mimeType,
        ContentLength: sizeBytes,
        Metadata: metadata,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: this.uploadExpiresIn });
      return { uploadUrl, storageKey, expiresAt };
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cloudflare R2 Storage credentials must be configured in production.');
    }

    // Local / Test presigned URL
    const mockEndpoint = this.endpoint || 'https://mock.r2.cloudflarestorage.com';
    return {
      uploadUrl: `${mockEndpoint}/${this.bucket}/${storageKey}?X-Amz-Expires=${this.uploadExpiresIn}`,
      storageKey,
      expiresAt,
    };
  }

  async generatePresignedDownload(
    storageKey: string,
    originalName?: string,
  ): Promise<PresignedDownloadResult> {
    const expiresAt = new Date(Date.now() + this.downloadExpiresIn * 1000).toISOString();

    if (this.isStorageConfigured && this.s3Client) {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ResponseContentDisposition: originalName ? `attachment; filename="${encodeURIComponent(originalName)}"` : undefined,
      });

      const downloadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: this.downloadExpiresIn });
      return { downloadUrl, expiresAt };
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cloudflare R2 Storage credentials must be configured in production.');
    }

    const mockEndpoint = this.endpoint || 'https://mock.r2.cloudflarestorage.com';
    return {
      downloadUrl: `${mockEndpoint}/${this.bucket}/${storageKey}?X-Amz-Expires=${this.downloadExpiresIn}`,
      expiresAt,
    };
  }

  async deleteObject(storageKey: string): Promise<boolean> {
    if (this.isStorageConfigured && this.s3Client) {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });
      await this.s3Client.send(command);
      return true;
    }
    return true;
  }

  async createMultipartUpload(storageKey: string, mimeType: string): Promise<{ uploadId: string; storageKey: string }> {
    if (this.isStorageConfigured && this.s3Client) {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: mimeType,
      });
      const response = await this.s3Client.send(command);
      return { uploadId: response.UploadId || 'upload_init', storageKey };
    }
    return { uploadId: `mock_mp_${Date.now()}`, storageKey };
  }

  async generatePresignedPartUpload(
    storageKey: string,
    uploadId: string,
    partNumber: number,
  ): Promise<{ uploadUrl: string; partNumber: number }> {
    if (this.isStorageConfigured && this.s3Client) {
      const command = new UploadPartCommand({
        Bucket: this.bucket,
        Key: storageKey,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: this.uploadExpiresIn });
      return { uploadUrl, partNumber };
    }
    const mockEndpoint = this.endpoint || 'https://mock.r2.cloudflarestorage.com';
    return {
      uploadUrl: `${mockEndpoint}/${this.bucket}/${storageKey}?uploadId=${uploadId}&partNumber=${partNumber}`,
      partNumber,
    };
  }

  async completeMultipartUpload(
    storageKey: string,
    uploadId: string,
    parts: Array<{ partNumber: number; eTag: string }>,
  ): Promise<{ location?: string }> {
    if (this.isStorageConfigured && this.s3Client) {
      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: storageKey,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.eTag })),
        },
      });
      const response = await this.s3Client.send(command);
      return { location: response.Location };
    }
    return { location: `https://storage.r2.dev/${storageKey}` };
  }

  async abortMultipartUpload(storageKey: string, uploadId: string): Promise<boolean> {
    if (this.isStorageConfigured && this.s3Client) {
      const command = new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: storageKey,
        UploadId: uploadId,
      });
      await this.s3Client.send(command);
      return true;
    }
    return true;
  }
}
