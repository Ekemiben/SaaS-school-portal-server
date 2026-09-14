import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageService } from './storage.service.js';
import { StorageValidator } from './storage.validator.js';
import { MemoryStorageAdapter } from './adapters/memory.storage-adapter.js';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('Production Object Storage & Tenant Sandboxing (Task 4: S3/GCS)', () => {
  const originalEnv = process.env;
  const TENANT_A = 'tenant_north_101';
  const TENANT_B = 'tenant_south_202';

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('1. Production Fail-Fast & Resilient Dev Fallback', () => {
    it('should fail fast in production if S3 credentials are missing', () => {
      process.env.NODE_ENV = 'production';
      process.env.STORAGE_PROVIDER = 's3';
      delete process.env.STORAGE_ACCESS_KEY_ID;
      delete process.env.STORAGE_SECRET_ACCESS_KEY;
      delete process.env.AWS_ACCESS_KEY_ID;

      const mockConfigService = new ConfigService({
        storage: {
          provider: 's3',
          bucket: 'prod-school-bucket',
          accessKeyId: '',
          secretAccessKey: '',
          requireStorage: true,
        },
      });

      expect(() => new StorageService(mockConfigService)).toThrow(
        /CRITICAL: AWS S3 storage configuration/,
      );
    });

    it('should fail fast in production if GCS bucket is missing', () => {
      process.env.NODE_ENV = 'production';
      process.env.STORAGE_PROVIDER = 'gcs';

      const mockConfigService = new ConfigService({
        storage: {
          provider: 'gcs',
          bucket: '',
          requireStorage: true,
        },
      });

      expect(() => new StorageService(mockConfigService)).toThrow(
        /CRITICAL: GCS storage bucket/,
      );
    });

    it('should fall back gracefully to in-memory adapter in dev/test when cloud credentials are missing', () => {
      process.env.NODE_ENV = 'development';
      const mockConfigService = new ConfigService({
        storage: {
          provider: 's3',
          bucket: 'dev-school-bucket',
          accessKeyId: '',
          secretAccessKey: '',
          requireStorage: false,
        },
      });

      const service = new StorageService(mockConfigService);
      expect(service.getAdapter().provider).toBe('memory');
    });
  });

  describe('2. Tenant Isolation & Path Sandboxing', () => {
    it('should construct strict tenant-prefixed storage keys', () => {
      const key = StorageValidator.buildTenantStorageKey(TENANT_A, 'homework', 'math-assignment.pdf');
      expect(key).toMatch(/^tenants\/tenant_north_101\/homework\/[a-f0-9]+-math-assignment\.pdf$/);
    });

    it('should sanitize dangerous characters and directory traversal attempts', () => {
      const traversalName = '../../../../etc/passwd';
      const key = StorageValidator.buildTenantStorageKey(TENANT_A, 'documents', traversalName);
      expect(key).not.toContain('..');
      expect(key).toContain('etc_passwd');
      expect(key.startsWith(`tenants/${TENANT_A}/documents/`)).toBe(true);
    });

    it('should reject dangerous executable file extensions', () => {
      expect(() =>
        StorageValidator.sanitizeFileName('malicious-script.exe'),
      ).toThrow(BadRequestException);

      expect(() =>
        StorageValidator.sanitizeFileName('payload.sh'),
      ).toThrow(BadRequestException);

      expect(() =>
        StorageValidator.sanitizeFileName('virus.bat'),
      ).toThrow(BadRequestException);

      expect(() =>
        StorageValidator.sanitizeFileName('index.php'),
      ).toThrow(BadRequestException);
    });

    it('should throw ForbiddenException on cross-tenant access violation', () => {
      const tenantAKey = `tenants/${TENANT_A}/documents/assignment.pdf`;
      expect(() =>
        StorageValidator.validateTenantAccess(TENANT_B, tenantAKey),
      ).toThrow(ForbiddenException);

      expect(() =>
        StorageValidator.validateTenantAccess(TENANT_A, tenantAKey),
      ).not.toThrow();
    });

    it('should reject path traversal in storage keys', () => {
      const maliciousKey = `tenants/${TENANT_A}/../${TENANT_B}/secret.pdf`;
      expect(() =>
        StorageValidator.validateTenantAccess(TENANT_A, maliciousKey),
      ).toThrow(ForbiddenException);
    });
  });

  describe('3. Category MIME Type & Size Limits', () => {
    it('should enforce avatar size limits (5MB) and image MIME types', () => {
      expect(() =>
        StorageValidator.validateCategoryAndLimits('avatars', 'image/png', 2 * 1024 * 1024),
      ).not.toThrow();

      expect(() =>
        StorageValidator.validateCategoryAndLimits('avatars', 'image/png', 6 * 1024 * 1024),
      ).toThrow(/exceeds maximum allowed/);

      expect(() =>
        StorageValidator.validateCategoryAndLimits('avatars', 'application/pdf', 1024),
      ).toThrow(/MIME type \[application\/pdf\] is not permitted/);
    });

    it('should enforce homework limits and reject invalid types', () => {
      expect(() =>
        StorageValidator.validateCategoryAndLimits('homework', 'application/pdf', 10 * 1024 * 1024),
      ).not.toThrow();

      expect(() =>
        StorageValidator.validateCategoryAndLimits('homework', 'application/x-dosexec', 1024),
      ).toThrow(/is not permitted/);
    });
  });

  describe('4. In-Memory Adapter Storage Lifecycle', () => {
    let memoryAdapter: MemoryStorageAdapter;

    beforeEach(() => {
      memoryAdapter = new MemoryStorageAdapter({
        bucket: 'test-bucket',
        presignedUrlExpiresSeconds: 600,
      });
    });

    it('should generate valid presigned upload and download URLs', async () => {
      const uploadRes = await memoryAdapter.getUploadPresignedUrl({
        tenantId: TENANT_A,
        key: `tenants/${TENANT_A}/documents/test.pdf`,
        mimeType: 'application/pdf',
      });

      expect(uploadRes.uploadUrl).toContain('uploadToken=');
      expect(uploadRes.method).toBe('PUT');
      expect(uploadRes.headers['Content-Type']).toBe('application/pdf');

      const downloadUrl = await memoryAdapter.getDownloadPresignedUrl({
        tenantId: TENANT_A,
        key: `tenants/${TENANT_A}/documents/test.pdf`,
        dispositionFileName: 'my-doc.pdf',
      });
      expect(downloadUrl).toContain('downloadToken=');
      expect(downloadUrl).toContain('response-content-disposition=');
    });

    it('should support buffer upload, exists, getMetadata, download, and delete', async () => {
      const testKey = `tenants/${TENANT_A}/receipts/rec_001.pdf`;
      const testBuffer = Buffer.from('PDF_PAYMENT_RECEIPT_CONTENT');

      expect(await memoryAdapter.objectExists(testKey)).toBe(false);

      await memoryAdapter.uploadBuffer(testKey, testBuffer, 'application/pdf', { author: 'accountant' });
      expect(await memoryAdapter.objectExists(testKey)).toBe(true);

      const meta = await memoryAdapter.getMetadata(testKey);
      expect(meta?.sizeBytes).toBe(testBuffer.length);
      expect(meta?.mimeType).toBe('application/pdf');

      const downloaded = await memoryAdapter.downloadBuffer(testKey);
      expect(downloaded.buffer.toString()).toBe('PDF_PAYMENT_RECEIPT_CONTENT');

      const deleted = await memoryAdapter.deleteObject(testKey);
      expect(deleted).toBe(true);
      expect(await memoryAdapter.objectExists(testKey)).toBe(false);
    });
  });
});
