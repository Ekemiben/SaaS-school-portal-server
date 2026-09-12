import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FilesService } from './files.service.js';
import { StorageService } from '../storage/storage.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ReportProcessor } from '../../jobs/processors/report.processor.js';

describe('Files Module & Multi-Tenant Storage Integration (Task 4: S3/GCS)', () => {
  let prisma: PrismaService;
  let storageService: StorageService;
  let filesService: FilesService;

  const TENANT_1 = 'tenant_mercury_101';
  const TENANT_2 = 'tenant_venus_202';
  const USER_1 = 'user_admin_001';

  beforeEach(() => {
    prisma = new PrismaService();
    const configService = new ConfigService({
      storage: {
        provider: 'memory',
        bucket: 'school-portal-docs',
        presignedUrlExpiresSeconds: 900,
      },
    });
    storageService = new StorageService(configService);
    filesService = new FilesService(prisma, storageService);
  });

  afterEach(() => {
    prisma.memoryStore.fileAssets.clear();
  });

  describe('1. File Upload Presigning & Registration', () => {
    it('should generate isolated tenant storage key and presigned upload URL', async () => {
      const result = await filesService.registerFile(TENANT_1, USER_1, {
        originalName: 'admission-form.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 15000,
        category: 'documents',
      });

      expect(result.file.id).toMatch(/^file_[a-f0-9]+$/);
      expect(result.file.tenantId).toBe(TENANT_1);
      expect(result.storageKey).toMatch(new RegExp(`^tenants/${TENANT_1}/documents/[a-f0-9]+-admission-form\\.pdf$`));
      expect(result.uploadUrl).toContain('uploadToken=');
      expect(result.downloadUrl).toContain('downloadToken=');
      expect(result.method).toBe('PUT');
    });

    it('should reject file registration with invalid inputs', async () => {
      await expect(
        filesService.registerFile(TENANT_1, USER_1, {
          originalName: '',
          mimeType: 'application/pdf',
          sizeBytes: 1000,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        filesService.registerFile(TENANT_1, USER_1, {
          originalName: 'script.exe',
          mimeType: 'application/x-msdownload',
          sizeBytes: 5000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Confirm Upload & Status Lifecycle', () => {
    it('should confirm file upload once object exists in storage', async () => {
      const registered = await filesService.registerFile(TENANT_1, USER_1, {
        originalName: 'syllabus.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        category: 'homework',
      });

      // Initially pending
      const initialConfirm = await filesService.confirmUpload(TENANT_1, registered.file.id);
      expect(initialConfirm.confirmed).toBe(false);
      expect(initialConfirm.status).toBe('PENDING_UPLOAD');

      // Simulate client upload to storage
      await storageService.uploadBuffer(
        TENANT_1,
        'homework',
        'syllabus.pdf',
        Buffer.from('PDF_SYLLABUS_CONTENT'),
        'application/pdf',
      );
      // Manually set stored buffer for the exact key
      const adapter = storageService.getAdapter();
      await adapter.uploadBuffer(registered.storageKey, Buffer.from('PDF_CONTENT'), 'application/pdf');

      // Now confirm
      const confirmed = await filesService.confirmUpload(TENANT_1, registered.file.id);
      expect(confirmed.confirmed).toBe(true);
      expect(confirmed.status).toBe('READY');
    });
  });

  describe('3. Tenant Isolation & Access Enforcement', () => {
    it('should prevent Tenant 2 from accessing or downloading Tenant 1 files', async () => {
      const tenant1File = await filesService.registerFile(TENANT_1, USER_1, {
        originalName: 'confidential_records.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 5000,
        category: 'documents',
      });

      // Tenant 1 can access
      const fileData = await filesService.getFile(TENANT_1, tenant1File.file.id);
      expect(fileData.id).toBe(tenant1File.file.id);
      expect(fileData.downloadUrl).toContain(`tenants/${TENANT_1}/`);

      // Tenant 2 is rejected
      await expect(
        filesService.getFile(TENANT_2, tenant1File.file.id),
      ).rejects.toThrow(NotFoundException);

      await expect(
        filesService.deleteFile(TENANT_2, tenant1File.file.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should filter listFiles by tenantId and category', async () => {
      await filesService.registerFile(TENANT_1, USER_1, {
        originalName: 'doc1.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        category: 'documents',
      });
      await filesService.registerFile(TENANT_1, USER_1, {
        originalName: 'avatar.png',
        mimeType: 'image/png',
        sizeBytes: 2000,
        category: 'avatars',
      });
      await filesService.registerFile(TENANT_2, 'user_2', {
        originalName: 'tenant2_doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1500,
        category: 'documents',
      });

      const tenant1All = await filesService.listFiles(TENANT_1);
      expect(tenant1All).toHaveLength(2);

      const tenant1Avatars = await filesService.listFiles(TENANT_1, { category: 'avatars' });
      expect(tenant1Avatars).toHaveLength(1);
      expect(tenant1Avatars[0].category).toBe('avatars');

      const tenant2All = await filesService.listFiles(TENANT_2);
      expect(tenant2All).toHaveLength(1);
      expect(tenant2All[0].originalName).toBe('tenant2_doc.pdf');
    });
  });

  describe('4. File Deletion & Purging', () => {
    it('should delete file from database and purge from storage', async () => {
      const registered = await filesService.registerFile(TENANT_1, USER_1, {
        originalName: 'to_delete.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
      });

      const adapter = storageService.getAdapter();
      await adapter.uploadBuffer(registered.storageKey, Buffer.from('TEMP'), 'application/pdf');
      expect(await adapter.objectExists(registered.storageKey)).toBe(true);

      const deleteRes = await filesService.deleteFile(TENANT_1, registered.file.id);
      expect(deleteRes.success).toBe(true);

      // Storage object deleted
      expect(await adapter.objectExists(registered.storageKey)).toBe(false);

      // Database record gone
      await expect(filesService.getFile(TENANT_1, registered.file.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('5. ReportProcessor Object Storage Integration', () => {
    it('should generate report PDF, store in object storage, and return download URL', async () => {
      const reportProcessor = new ReportProcessor(prisma, storageService);
      const result = await reportProcessor.process({
        id: 'job_rep_99',
        data: {
          reportType: 'report-card',
          tenantId: TENANT_1,
          parameters: { classId: 'cls_1' },
          requestedByUserId: USER_1,
        },
      });

      expect(result.status).toBe('completed');
      expect(result.artifactKey).toMatch(new RegExp(`^tenants/${TENANT_1}/reports/[a-f0-9]+-report-card_\\d+\\.pdf$`));
      expect(result.downloadUrl).toContain(`tenants/${TENANT_1}/reports/`);

      // Verify artifact exists in storage
      const exists = await storageService.objectExists(TENANT_1, result.artifactKey);
      expect(exists).toBe(true);

      const downloaded = await storageService.downloadBuffer(TENANT_1, result.artifactKey);
      expect(downloaded.buffer.toString()).toContain('Mock Report: report-card');
    });
  });
});
