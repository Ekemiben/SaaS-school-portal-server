import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FilesService } from '../src/modules/files/files.service.js';
import { CloudflareR2StorageProvider } from '../src/modules/files/storage.provider.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';

describe('Cloudflare R2 / S3 Object Storage (Task 4)', () => {
  let filesService: FilesService;
  let storageProvider: CloudflareR2StorageProvider;
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;

  const tenantA = 'tenant_storage_alpha_01';
  const tenantB = 'tenant_storage_beta_02';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);

    storageProvider = new CloudflareR2StorageProvider();
    storageProvider.onModuleInit();

    filesService = new FilesService(prisma, storageProvider);

    // Setup tenants in bypass context
    await rlsHelper.withBypassContext(async (tx) => {
      await tx.fileAsset.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });

      await tx.tenant.create({
        data: { id: tenantA, name: 'Storage Alpha School', slug: 'storage-alpha' },
      });
      await tx.tenant.create({
        data: { id: tenantB, name: 'Storage Beta School', slug: 'storage-beta' },
      });
    });
  });

  afterAll(async () => {
    await rlsHelper.withBypassContext(async (tx) => {
      await tx.fileAsset.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    });
    await prisma.onModuleDestroy();
  });

  it('1. Presigned Upload: Generates tenant-scoped storage key and valid upload URL', async () => {
    const result = await filesService.registerAndPresignUpload(tenantA, 'user_001', {
      originalName: 'report_card_grade10.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024 * 500, // 500KB
      category: 'documents',
    });

    expect(result.fileId).toBeDefined();
    expect(result.storageKey).toMatch(new RegExp(`^tenants/${tenantA}/documents/`));
    expect(result.uploadUrl).toBeDefined();
    expect(result.expiresAt).toBeDefined();
  });

  it('2. MIME-Type Validation: Rejects unapproved or dangerous MIME types', async () => {
    await expect(
      filesService.registerAndPresignUpload(tenantA, 'user_001', {
        originalName: 'virus.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 1024 * 10,
        category: 'documents',
      }),
    ).rejects.toThrow(/Unsupported MIME type/);
  });

  it('3. Category Size Limit: Rejects files exceeding category size limit', async () => {
    // Avatars category limit is 5MB. Attempting 10MB must throw.
    await expect(
      filesService.registerAndPresignUpload(tenantA, 'user_001', {
        originalName: 'large_avatar.png',
        mimeType: 'image/png',
        sizeBytes: 10 * 1024 * 1024, // 10MB
        category: 'avatars',
      }),
    ).rejects.toThrow(/exceeds maximum allowed limit/);
  });

  it('4. Presigned Download: Generates download URL for existing file asset', async () => {
    const upload = await filesService.registerAndPresignUpload(tenantA, 'user_001', {
      originalName: 'fees_receipt_2026.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024 * 200,
      category: 'receipts',
    });

    const download = await filesService.getPresignedDownload(tenantA, upload.fileId);
    expect(download.file.id).toBe(upload.fileId);
    expect(download.downloadUrl).toBeDefined();
  });

  it('5. Cross-Tenant Storage Boundary: Tenant A must NEVER access Tenant B file asset', async () => {
    // Register file under Tenant B
    const fileB = await filesService.registerAndPresignUpload(tenantB, 'user_beta_001', {
      originalName: 'confidential_payroll_b.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 1024 * 100,
      category: 'reports',
    });

    // Tenant A attempts to access Tenant B file -> must throw NotFoundException
    await expect(filesService.getPresignedDownload(tenantA, fileB.fileId)).rejects.toThrow(
      /File asset not found in this school/,
    );
  });

  it('6. Cross-Tenant Deletion Guard: Tenant A cannot delete Tenant B file', async () => {
    const fileB = await filesService.registerAndPresignUpload(tenantB, 'user_beta_001', {
      originalName: 'exam_papers_b.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024 * 300,
      category: 'documents',
    });

    // Tenant A attempts to delete Tenant B file -> rejected
    await expect(filesService.deleteFile(tenantA, fileB.fileId)).rejects.toThrow(
      /File asset not found in this school/,
    );

    // Tenant B can delete their own file
    const deleteResult = await filesService.deleteFile(tenantB, fileB.fileId);
    expect(deleteResult.success).toBe(true);
  });

  it('7. Production Fail-Fast: Refuses to silently emit URLs in production if credentials are missing', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevKey = process.env.STORAGE_ACCESS_KEY_ID;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.STORAGE_ACCESS_KEY_ID;

      const unconfiguredProvider = new CloudflareR2StorageProvider();
      unconfiguredProvider.onModuleInit();

      await expect(
        unconfiguredProvider.generatePresignedUpload('tenants/tenant_001/documents/test.pdf', 'application/pdf', 1000),
      ).rejects.toThrow(/Cloudflare R2 Storage credentials must be configured/);
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.STORAGE_ACCESS_KEY_ID = prevKey;
    }
  });
});
