import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IStorageAdapter,
  StorageConfigOptions,
  PresignedUploadResult,
  StorageFileMetadata,
  StorageProviderType,
} from './storage.interface.js';
import { StorageValidator, type SchoolImageCategory } from './storage.validator.js';
import { S3StorageAdapter } from './adapters/s3.storage-adapter.js';
import { GCSStorageAdapter } from './adapters/gcs.storage-adapter.js';
import { MemoryStorageAdapter } from './adapters/memory.storage-adapter.js';

export interface UploadSchoolImageOptions {
  schoolId: string;
  schoolSlug: string;
  category: string;
  rawFileName: string;
  buffer: Buffer;
  declaredMimeType?: string;
  entityId?: string;
  userId?: string;
}

export interface UploadSchoolImageResult {
  storageKey: string;
  uniqueFileName: string;
  mimeType: string;
  sizeBytes: number;
  category: SchoolImageCategory;
  publicUrl?: string;
}

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

  /**
   * Constructs the public URL for publicly accessible website images
   */
  getPublicUrl(storageKey: string): string {
    if (this.config.endpoint) {
      return `${this.config.endpoint.replace(/\/+$/, '')}/${this.config.bucket}/${storageKey}`;
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${storageKey}`;
  }

  /**
   * Multi-Tenant School Image Upload Pipeline:
   * 1. Resolves category to mandatory allowlist ('staff-image' | 'student-image' | 'website-image')
   * 2. Inspects binary magic bytes to strictly ensure valid image content
   * 3. Generates collision-resistant unique filename
   * 4. Builds isolated S3 key: {school-storage-identifier}/{category}/{unique-filename}
   * 5. Uploads directly to S3 bucket with isolated tenant metadata
   */
  async uploadSchoolImage(options: UploadSchoolImageOptions): Promise<UploadSchoolImageResult> {
    const category = StorageValidator.resolveImageCategory(options.category);
    const { mimeType, extension } = StorageValidator.detectAndValidateImageSignature(
      options.buffer,
      options.declaredMimeType,
    );

    const schoolIdentifier = (options.schoolSlug || options.schoolId || 'default-school')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '');

    const uniqueFileName = StorageValidator.generateUniqueImageFilename(
      category,
      extension,
      options.entityId,
      options.rawFileName,
    );

    const storageKey = StorageValidator.buildSchoolImageKey(
      schoolIdentifier,
      category,
      uniqueFileName,
    );

    this.logger.log(
      `Uploading school image to S3: bucket=[${this.config.bucket}], key=[${storageKey}], size=[${options.buffer.length}B], mime=[${mimeType}]`,
    );

    await this.adapter.uploadBuffer(storageKey, options.buffer, mimeType, {
      school_id: options.schoolId,
      school_slug: schoolIdentifier,
      category,
      uploaded_by: options.userId || 'system',
    });

    const publicUrl = category === 'website-image' ? this.getPublicUrl(storageKey) : undefined;

    return {
      storageKey,
      uniqueFileName,
      mimeType,
      sizeBytes: options.buffer.length,
      category,
      publicUrl,
    };
  }

  async getSchoolImageDownloadUrl(
    schoolIdentifier: string | { tenantId?: string; slug?: string },
    storageKey: string,
    customExpiresSeconds?: number,
  ): Promise<string> {
    StorageValidator.validateTenantAccess(schoolIdentifier, storageKey);
    const tenantId =
      typeof schoolIdentifier === 'string'
        ? schoolIdentifier
        : schoolIdentifier.tenantId || schoolIdentifier.slug || '';

    return this.adapter.getDownloadPresignedUrl({
      tenantId,
      key: storageKey,
      expiresInSeconds: customExpiresSeconds || this.config.presignedUrlExpiresSeconds,
    });
  }

  async getSchoolImageBuffer(
    schoolIdentifier: string | { tenantId?: string; slug?: string },
    storageKey: string,
  ): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    StorageValidator.validateTenantAccess(schoolIdentifier, storageKey);
    return this.adapter.downloadBuffer(storageKey);
  }

  async deleteSchoolImage(
    schoolIdentifier: string | { tenantId?: string; slug?: string },
    storageKey: string,
  ): Promise<boolean> {
    StorageValidator.validateTenantAccess(schoolIdentifier, storageKey);
    return this.adapter.deleteObject(storageKey);
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
    tenantId: string | { tenantId?: string; slug?: string },
    storageKey: string,
  ): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    StorageValidator.validateTenantAccess(tenantId, storageKey);
    return this.adapter.downloadBuffer(storageKey);
  }

  async deleteObject(
    tenantId: string | { tenantId?: string; slug?: string },
    storageKey: string,
  ): Promise<boolean> {
    StorageValidator.validateTenantAccess(tenantId, storageKey);
    return this.adapter.deleteObject(storageKey);
  }

  async objectExists(
    tenantId: string | { tenantId?: string; slug?: string },
    storageKey: string,
  ): Promise<boolean> {
    StorageValidator.validateTenantAccess(tenantId, storageKey);
    return this.adapter.objectExists(storageKey);
  }

  async getMetadata(
    tenantId: string | { tenantId?: string; slug?: string },
    storageKey: string,
  ): Promise<StorageFileMetadata | null> {
    StorageValidator.validateTenantAccess(tenantId, storageKey);
    return this.adapter.getMetadata(storageKey);
  }
}
