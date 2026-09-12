export type StorageProviderType = 's3' | 'gcs' | 'memory';

export interface StorageConfigOptions {
  provider: StorageProviderType;
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  presignedUrlExpiresSeconds: number;
  gcsProjectId?: string;
  gcsKeyFilename?: string;
  requireStorage?: boolean;
}

export interface PresignedUploadOptions {
  tenantId: string;
  key: string;
  mimeType: string;
  maxSizeBytes?: number;
  expiresInSeconds?: number;
  metadata?: Record<string, string>;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface PresignedDownloadOptions {
  tenantId: string;
  key: string;
  expiresInSeconds?: number;
  dispositionFileName?: string;
}

export interface StorageFileMetadata {
  key: string;
  sizeBytes: number;
  mimeType: string;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface IStorageAdapter {
  readonly provider: StorageProviderType;
  getUploadPresignedUrl(options: PresignedUploadOptions): Promise<PresignedUploadResult>;
  getDownloadPresignedUrl(options: PresignedDownloadOptions): Promise<string>;
  uploadBuffer(key: string, buffer: Buffer, mimeType: string, metadata?: Record<string, string>): Promise<void>;
  downloadBuffer(key: string): Promise<{ buffer: Buffer; mimeType: string; size: number }>;
  deleteObject(key: string): Promise<boolean>;
  objectExists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<StorageFileMetadata | null>;
}
