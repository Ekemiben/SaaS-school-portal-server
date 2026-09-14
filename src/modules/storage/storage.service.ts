import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IStorageAdapter,
  StorageConfigOptions,
  PresignedUploadResult,
  StorageFileMetadata,
  StorageProviderType,
} from './storage.interface.js';
import { StorageValidator } from './storage.validator.js';
import { S3StorageAdapter } from './adapters/s3.storage-adapter.js';
import { GCSStorageAdapter } from './adapters/gcs.storage-adapter.js';
import { MemoryStorageAdapter } from './adapters/memory.storage-adapter.js';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private adapter: IStorageAdapter;
  private readonly config: StorageConfigOptions;

  constructor(private readonly configService: ConfigService) {
    const rawStorage = this.configService.get<any>('storage') || {};
    this.config = {
      provider: (rawStorage.provider || process.env.STORAGE_PROVIDER || 's3').toLowerCase() as StorageProviderType,
      bucket: rawStorage.bucket !== undefined ? rawStorage.bucket : (process.env.STORAGE_BUCKET || 'school-saas-documents'),
      region: rawStorage.region || process.env.STORAGE_REGION || 'us-east-1',
      endpoint: rawStorage.endpoint || process.env.STORAGE_ENDPOINT || undefined,
      accessKeyId: rawStorage.accessKeyId || process.env.STORAGE_ACCESS_KEY_ID || '',
      secretAccessKey: rawStorage.secretAccessKey || process.env.STORAGE_SECRET_ACCESS_KEY || '',
      presignedUrlExpiresSeconds: Number(rawStorage.presignedUrlExpiresSeconds || process.env.STORAGE_PRESIGNED_EXPIRES || '900'),
      gcsProjectId: rawStorage.gcsProjectId || process.env.STORAGE_GCS_PROJECT_ID || undefined,
      gcsKeyFilename: rawStorage.gcsKeyFilename || process.env.STORAGE_GCS_KEYFILE || undefined,
      requireStorage: rawStorage.requireStorage ?? (process.env.REQUIRE_STORAGE === 'true'),
    };

    this.adapter = this.initializeAdapter();
  }

  onModuleInit() {
    this.validateProductionRequirements();
  }

  private initializeAdapter(): IStorageAdapter {
    const isProd = process.env.NODE_ENV === 'production' || this.config.requireStorage;

    if (this.config.provider === 'gcs') {
      if (!this.config.bucket && isProd) {
        throw new Error('CRITICAL: GCS storage bucket (STORAGE_BUCKET) is required in production mode.');
      }
      if (!isProd && !this.config.gcsProjectId && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        this.logger.warn('GCS credentials not detected in non-production mode. Initializing resilient in-memory storage fallback.');
        return new MemoryStorageAdapter(this.config);
      }
      return new GCSStorageAdapter(this.config);
    }

    if (this.config.provider === 's3') {
      const hasCreds = (this.config.accessKeyId && this.config.secretAccessKey) || process.env.AWS_ACCESS_KEY_ID;
      if (isProd && (!this.config.bucket || !hasCreds)) {
        throw new Error('CRITICAL: AWS S3 storage configuration (STORAGE_BUCKET, credentials) is required in production mode.');
      }
      if (!isProd && !hasCreds) {
        this.logger.warn('S3 credentials not detected in dev/test environment. Falling back to in-memory object storage adapter.');
        return new MemoryStorageAdapter(this.config);
      }
      return new S3StorageAdapter(this.config);
    }

    return new MemoryStorageAdapter(this.config);
  }

  private validateProductionRequirements(): void {
    const isProd = process.env.NODE_ENV === 'production' || this.config.requireStorage;
    if (isProd) {
      if (this.adapter.provider === 'memory') {
        throw new Error('CRITICAL: In-memory object storage fallback is strictly forbidden in production mode.');
      }
      this.logger.log(`Production object storage initialized using provider [${this.adapter.provider}] with bucket [${this.config.bucket}]`);
    } else {
      this.logger.log(`Storage service initialized using provider [${this.adapter.provider}] (bucket: ${this.config.bucket})`);
    }
  }

  getAdapter(): IStorageAdapter {
    return this.adapter;
  }

  async getUploadPresignedUrl(
    tenantId: string,
    category: string,
    rawFileName: string,
    mimeType: string,
    sizeBytes: number,
    customExpiresSeconds?: number,
  ): Promise<PresignedUploadResult> {
    StorageValidator.validateCategoryAndLimits(category, mimeType, sizeBytes);
    const storageKey = StorageValidator.buildTenantStorageKey(tenantId, category, rawFileName);

    return this.adapter.getUploadPresignedUrl({
      tenantId,
      key: storageKey,
      mimeType,
      maxSizeBytes: sizeBytes,
      expiresInSeconds: customExpiresSeconds || this.config.presignedUrlExpiresSeconds,
    });
  }

  async getDownloadPresignedUrl(
    tenantId: string,
    storageKey: string,
    dispositionFileName?: string,
    customExpiresSeconds?: number,
  ): Promise<string> {
    StorageValidator.validateTenantAccess(tenantId, storageKey);

    return this.adapter.getDownloadPresignedUrl({
      tenantId,
      key: storageKey,
      dispositionFileName: dispositionFileName ? StorageValidator.sanitizeFileName(dispositionFileName) : undefined,
      expiresInSeconds: customExpiresSeconds || this.config.presignedUrlExpiresSeconds,
    });
  }

  async uploadBuffer(
    tenantId: string,
    category: string,
    rawFileName: string,
    buffer: Buffer,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    StorageValidator.validateCategoryAndLimits(category, mimeType, buffer.length);
    const storageKey = StorageValidator.buildTenantStorageKey(tenantId, category, rawFileName);

    await this.adapter.uploadBuffer(storageKey, buffer, mimeType, {
      tenant_id: tenantId,
      ...metadata,
    });

    return { storageKey, sizeBytes: buffer.length };
  }

  async downloadBuffer(
    tenantId: string,
    storageKey: string,
  ): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    StorageValidator.validateTenantAccess(tenantId, storageKey);
    return this.adapter.downloadBuffer(storageKey);
  }

  async deleteObject(tenantId: string, storageKey: string): Promise<boolean> {
    StorageValidator.validateTenantAccess(tenantId, storageKey);
    return this.adapter.deleteObject(storageKey);
  }

  async objectExists(tenantId: string, storageKey: string): Promise<boolean> {
    StorageValidator.validateTenantAccess(tenantId, storageKey);
    return this.adapter.objectExists(storageKey);
  }

  async getMetadata(tenantId: string, storageKey: string): Promise<StorageFileMetadata | null> {
    StorageValidator.validateTenantAccess(tenantId, storageKey);
    return this.adapter.getMetadata(storageKey);
  }
}
