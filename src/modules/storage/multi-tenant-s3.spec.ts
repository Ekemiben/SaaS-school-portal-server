import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from './storage.service.js';
import { StorageValidator } from './storage.validator.js';
import { FilesService } from '../files/files.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Multi-Tenant AWS S3 Image Storage Architecture Test Suite', () => {
  let prisma: PrismaService;
  let storageService: StorageService;
  let filesService: FilesService;
  let fileAssetsStore: Map<string, any>;

  const SCHOOL_A_ID = 'school_alpha_uuid_101';
  const SCHOOL_A_SLUG = 'greenfield-international-school';

  const SCHOOL_B_ID = 'school_beta_uuid_202';
  const SCHOOL_B_SLUG = 'st-augustine-academy';

  const USER_A_ADMIN = 'admin_alpha_01';
  const USER_B_ADMIN = 'admin_beta_02';

  // Valid binary signatures for tests
  const VALID_JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const VALID_PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const VALID_WEBP_BUFFER = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBPVP8 '),
  ]);
  const VALID_GIF_BUFFER = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00');
  const MALICIOUS_EXE_BUFFER = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff');

  beforeEach(() => {
    fileAssetsStore = new Map();

    prisma = {
      tenant: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.id === SCHOOL_A_ID || where.slug === SCHOOL_A_SLUG) {
            return { id: SCHOOL_A_ID, slug: SCHOOL_A_SLUG, name: 'Greenfield International School' };
          }
          if (where.id === SCHOOL_B_ID || where.slug === SCHOOL_B_SLUG) {
            return { id: SCHOOL_B_ID, slug: SCHOOL_B_SLUG, name: 'St. Augustine Academy' };
          }
          return null;
        }),
      },
      fileAsset: {
        create: vi.fn(async ({ data }: any) => {
          const record = { ...data, createdAt: new Date() };
          fileAssetsStore.set(data.id, record);
          return record;
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          return fileAssetsStore.get(where.id) || null;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          for (const item of fileAssetsStore.values()) {
            if (where.id && item.id !== where.id) continue;
            if (where.tenantId && item.tenantId !== where.tenantId) continue;
            if (where.storageKey && item.storageKey !== where.storageKey) continue;
            return item;
          }
          return null;
        }),
        delete: vi.fn(async ({ where }: any) => {
          const item = fileAssetsStore.get(where.id);
          fileAssetsStore.delete(where.id);
          return item;
        }),
      },
    } as unknown as PrismaService;

    const configService = new ConfigService({
      storage: {
        provider: 'memory',
        bucket: 'extensive-bucket',
        region: 'eu-north-1',
        presignedUrlExpiresSeconds: 900,
      },
    });

    storageService = new StorageService(configService);
    filesService = new FilesService(prisma, storageService);
  });

  describe('1. Mandatory S3 Storage Key Structure', () => {
    it('should generate exact {school-storage-identifier}/staff-image/{unique-filename} key for staff uploads', async () => {
      const result = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        {
          originalname: 'principal_portrait.jpg',
          mimetype: 'image/jpeg',
          buffer: VALID_JPEG_BUFFER,
        },
        'staff-image',
        SCHOOL_A_SLUG,
      );

      expect(result.storageKey).toMatch(
        /^greenfield-international-school\/staff-image\/staff-[a-z0-9]+-[a-f0-9]{6}\.jpg$/,
      );
      expect(result.file.category).toBe('staff-image');
      expect(result.url).toBe(`/api/v1/files/view/${result.fileId}`);
    });

    it('should generate exact {school-storage-identifier}/student-image/{unique-filename} key for student uploads', async () => {
      const result = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        {
          originalname: 'student_passport.png',
          mimetype: 'image/png',
          buffer: VALID_PNG_BUFFER,
        },
        'student-image',
        SCHOOL_A_SLUG,
      );

      expect(result.storageKey).toMatch(
        /^greenfield-international-school\/student-image\/student-[a-z0-9]+-[a-f0-9]{6}\.png$/,
      );
      expect(result.file.category).toBe('student-image');
      expect(result.url).toBe(`/api/v1/files/view/${result.fileId}`);
    });

    it('should generate exact {school-storage-identifier}/website-image/{unique-filename} key for website uploads', async () => {
      const result = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        {
          originalname: 'home_banner.webp',
          mimetype: 'image/webp',
          buffer: VALID_WEBP_BUFFER,
        },
        'website-image',
        SCHOOL_A_SLUG,
      );

      expect(result.storageKey).toMatch(
        /^greenfield-international-school\/website-image\/home-banner-[a-z0-9]+-[a-f0-9]{6}\.webp$/,
      );
      expect(result.file.category).toBe('website-image');
      expect(result.url).toContain('home-banner');
    });

    it('should guarantee collision resistance for duplicate original filenames', async () => {
      const upload1 = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'avatar.jpg', buffer: VALID_JPEG_BUFFER },
        'staff-image',
        SCHOOL_A_SLUG,
      );

      const upload2 = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'avatar.jpg', buffer: VALID_JPEG_BUFFER },
        'staff-image',
        SCHOOL_A_SLUG,
      );

      expect(upload1.storageKey).not.toBe(upload2.storageKey);
      expect(upload1.fileId).not.toBe(upload2.fileId);
    });
  });

  describe('2. Multi-Tenant Isolation & Cross-School Protection', () => {
    it('should store images under distinct school namespaces for School A and School B', async () => {
      const schoolAUpload = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'teacher.png', buffer: VALID_PNG_BUFFER },
        'staff-image',
        SCHOOL_A_SLUG,
      );

      const schoolBUpload = await filesService.saveUploadedFile(
        SCHOOL_B_ID,
        USER_B_ADMIN,
        { originalname: 'teacher.png', buffer: VALID_PNG_BUFFER },
        'staff-image',
        SCHOOL_B_SLUG,
      );

      expect(schoolAUpload.storageKey.startsWith('greenfield-international-school/')).toBe(true);
      expect(schoolBUpload.storageKey.startsWith('st-augustine-academy/')).toBe(true);
      expect(schoolAUpload.storageKey).not.toContain('st-augustine-academy');
      expect(schoolBUpload.storageKey).not.toContain('greenfield-international-school');
    });

    it('should reject School B attempting to delete or access School A files', async () => {
      const schoolAFile = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'confidential_staff.jpg', buffer: VALID_JPEG_BUFFER },
        'staff-image',
        SCHOOL_A_SLUG,
      );

      // School B attempts to delete School A's file
      await expect(
        filesService.deleteFile(SCHOOL_B_ID, schoolAFile.fileId, SCHOOL_B_SLUG),
      ).rejects.toThrow(NotFoundException);

      // School B attempts to view School A's private staff photo
      await expect(
        filesService.viewFileAsset({ tenantId: SCHOOL_B_ID, slug: SCHOOL_B_SLUG }, schoolAFile.fileId),
      ).rejects.toThrow(ForbiddenException);

      // School A can view its own file without exception
      const viewResult = await filesService.viewFileAsset(
        { tenantId: SCHOOL_A_ID, slug: SCHOOL_A_SLUG },
        schoolAFile.fileId,
      );
      expect(viewResult.buffer).toEqual(VALID_JPEG_BUFFER);
    });

    it('should reject path traversal in storage keys', () => {
      const maliciousKey = `${SCHOOL_A_SLUG}/../${SCHOOL_B_SLUG}/staff-image/stolen.jpg`;
      expect(() =>
        StorageValidator.validateTenantAccess(
          { tenantId: SCHOOL_A_ID, slug: SCHOOL_A_SLUG },
          maliciousKey,
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('3. Required Category Allowlist & Legacy Mapping', () => {
    it('should map legacy categories avatars -> staff-image and students -> student-image', async () => {
      const legacyAvatar = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'avatar.jpg', buffer: VALID_JPEG_BUFFER },
        'avatars',
        SCHOOL_A_SLUG,
      );
      expect(legacyAvatar.storageKey).toContain('/staff-image/');

      const legacyStudent = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'student.png', buffer: VALID_PNG_BUFFER },
        'students',
        SCHOOL_A_SLUG,
      );
      expect(legacyStudent.storageKey).toContain('/student-image/');
    });

    it('should map legacy categories branding, hero, gallery, stamps -> website-image', async () => {
      const legacyBranding = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'logo.png', buffer: VALID_PNG_BUFFER },
        'branding',
        SCHOOL_A_SLUG,
      );
      expect(legacyBranding.storageKey).toContain('/website-image/');

      const legacyGallery = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'event.webp', buffer: VALID_WEBP_BUFFER },
        'gallery',
        SCHOOL_A_SLUG,
      );
      expect(legacyGallery.storageKey).toContain('/website-image/');
    });

    it('should reject arbitrary or unapproved categories with BadRequestException', async () => {
      await expect(
        filesService.saveUploadedFile(
          SCHOOL_A_ID,
          USER_A_ADMIN,
          { originalname: 'photo.jpg', buffer: VALID_JPEG_BUFFER },
          'arbitrary_unapproved_folder',
          SCHOOL_A_SLUG,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. File Content & Magic Byte Signature Validation', () => {
    it('should allow valid JPEG, PNG, WEBP, and GIF buffers', async () => {
      const jpeg = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'test.jpg', buffer: VALID_JPEG_BUFFER },
        'staff-image',
        SCHOOL_A_SLUG,
      );
      expect(jpeg.file.mimeType).toBe('image/jpeg');

      const png = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'test.png', buffer: VALID_PNG_BUFFER },
        'staff-image',
        SCHOOL_A_SLUG,
      );
      expect(png.file.mimeType).toBe('image/png');

      const webp = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'test.webp', buffer: VALID_WEBP_BUFFER },
        'website-image',
        SCHOOL_A_SLUG,
      );
      expect(webp.file.mimeType).toBe('image/webp');

      const gif = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'test.gif', buffer: VALID_GIF_BUFFER },
        'website-image',
        SCHOOL_A_SLUG,
      );
      expect(gif.file.mimeType).toBe('image/gif');
    });

    it('should reject disguised executable files (EXE with jpg extension)', async () => {
      await expect(
        filesService.saveUploadedFile(
          SCHOOL_A_ID,
          USER_A_ADMIN,
          { originalname: 'trojan_disguised.jpg', buffer: MALICIOUS_EXE_BUFFER },
          'staff-image',
          SCHOOL_A_SLUG,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject oversized image files (> 10MB)', async () => {
      const hugeBuffer = Buffer.alloc(11 * 1024 * 1024);
      // Valid JPEG header on huge buffer
      hugeBuffer[0] = 0xff;
      hugeBuffer[1] = 0xd8;
      hugeBuffer[2] = 0xff;

      await expect(
        filesService.saveUploadedFile(
          SCHOOL_A_ID,
          USER_A_ADMIN,
          { originalname: 'huge.jpg', buffer: hugeBuffer },
          'staff-image',
          SCHOOL_A_SLUG,
        ),
      ).rejects.toThrow(/exceeds maximum permitted limit/);
    });
  });

  describe('5. Base64 Direct Upload & Safe File Replacement', () => {
    it('should successfully handle base64 dataUrl direct upload', async () => {
      const base64DataUrl = `data:image/png;base64,${VALID_PNG_BUFFER.toString('base64')}`;
      const result = await filesService.uploadDirectImage(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        {
          dataUrl: base64DataUrl,
          filename: 'uploaded_via_modal.png',
          category: 'staff-image',
        },
        SCHOOL_A_SLUG,
      );

      expect(result.storageKey).toMatch(/^greenfield-international-school\/staff-image\//);
      expect(result.file.sizeBytes).toBe(VALID_PNG_BUFFER.length);
    });

    it('should replace previous image safely without deleting unrelated files', async () => {
      // 1. Upload original photo
      const oldUpload = await filesService.saveUploadedFile(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'old_photo.jpg', buffer: VALID_JPEG_BUFFER },
        'staff-image',
        SCHOOL_A_SLUG,
      );

      // Verify old file exists in storage
      const existsOldBefore = await storageService.getAdapter().objectExists(oldUpload.storageKey);
      expect(existsOldBefore).toBe(true);

      // 2. Perform replacement
      const replacement = await filesService.replaceEntityImage(
        SCHOOL_A_ID,
        USER_A_ADMIN,
        { originalname: 'new_photo.png', buffer: VALID_PNG_BUFFER },
        'staff-image',
        oldUpload.fileId,
        SCHOOL_A_SLUG,
      );

      expect(replacement.storageKey).not.toBe(oldUpload.storageKey);

      // 3. Old file purged from storage and database
      const existsOldAfter = await storageService.getAdapter().objectExists(oldUpload.storageKey);
      expect(existsOldAfter).toBe(false);

      // 4. New file is intact
      const existsNew = await storageService.getAdapter().objectExists(replacement.storageKey);
      expect(existsNew).toBe(true);
    });
  });
});
