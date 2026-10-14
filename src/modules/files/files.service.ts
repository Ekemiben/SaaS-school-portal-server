import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CloudflareR2StorageProvider } from './storage.provider.js';
import { StorageValidator, SCHOOL_IMAGE_CATEGORIES, type SchoolImageCategory } from '../storage/storage.validator.js';
import { ALLOWED_MIME_TYPES, ALLOWED_FILE_CATEGORIES, CATEGORY_SIZE_LIMITS, FileCategory } from './storage.constants.js';
import { PresignUploadDto } from './dto/file-upload.dto.js';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

export interface RegisterFileInput {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category?: string;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    @Optional() private readonly legacyStorageProvider?: CloudflareR2StorageProvider,
  ) {}

  /**
   * Helper to retrieve or resolve the tenant slug for isolated S3 key generation
   */
  private async getSchoolSlug(tenantId: string, providedSlug?: string): Promise<string> {
    if (providedSlug) {
      return providedSlug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    }
    if (this.prisma?.tenant?.findUnique) {
      try {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { slug: true },
        });
        if (tenant?.slug) {
          return tenant.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
        }
      } catch (err: any) {
        this.logger.warn(`Could not resolve tenant slug from database: ${err?.message}`);
      }
    }
    return tenantId.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
  }

  async listFiles(tenantId: string, filter?: { category?: string; limit?: number; offset?: number }) {
    const category = filter?.category;
    return this.prisma.fileAsset.findMany({
      where: {
        tenantId,
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filter?.limit,
      skip: filter?.offset,
    });
  }

  /**
   * Unified file registration and presigned upload generation:
   * Uses isolated S3 key structure {school-storage-identifier}/{category}/{unique-filename} for images
   * and tenants/{tenantId}/{category}/... for documents.
   */
  async registerFile(
    tenantId: string,
    userId: string,
    dto: RegisterFileInput,
    tenantSlug?: string,
  ) {
    if (!dto.originalName || !dto.originalName.trim()) {
      throw new BadRequestException('originalName is required');
    }
    if (
      !dto.mimeType ||
      !ALLOWED_MIME_TYPES.has(dto.mimeType) ||
      dto.mimeType === 'application/x-msdownload' ||
      dto.originalName.endsWith('.exe')
    ) {
      throw new BadRequestException(`Unsupported MIME type: "${dto.mimeType}". Allowed types include documents, images, and archives.`);
    }
    if (!dto.sizeBytes || dto.sizeBytes <= 0) {
      throw new BadRequestException('sizeBytes must be greater than 0');
    }

    const schoolSlug = await this.getSchoolSlug(tenantId, tenantSlug);
    const rawCategory = (dto.category || 'documents').toLowerCase().trim();

    const isImageCategory =
      SCHOOL_IMAGE_CATEGORIES.includes(rawCategory as any) ||
      ['avatars', 'staff', 'student', 'students', 'website', 'branding', 'gallery', 'campus', 'hero', 'principal', 'signatures', 'stamps', 'images'].includes(rawCategory);

    let category: string;
    let storageKey: string;

    if (isImageCategory) {
      const canonicalCategory = StorageValidator.resolveImageCategory(rawCategory);
      category = (SCHOOL_IMAGE_CATEGORIES as readonly string[]).includes(rawCategory)
        ? canonicalCategory
        : rawCategory;
      const ext = dto.originalName.split('.').pop() || 'jpg';
      const uniqueFilename = StorageValidator.generateUniqueImageFilename(canonicalCategory, ext, undefined, dto.originalName);
      storageKey = StorageValidator.buildSchoolImageKey(schoolSlug, canonicalCategory, uniqueFilename);
    } else {
      category = (ALLOWED_FILE_CATEGORIES.includes(rawCategory as any)
        ? rawCategory
        : 'documents') as FileCategory;
      const maxAllowedSize = CATEGORY_SIZE_LIMITS[category as FileCategory] || 25 * 1024 * 1024;
      if (dto.sizeBytes > maxAllowedSize) {
        throw new BadRequestException(`File size (${dto.sizeBytes} bytes) exceeds maximum allowed limit of ${maxAllowedSize} bytes for category "${category}".`);
      }
      const sanitizedFileName = StorageValidator.sanitizeFileName(dto.originalName);
      storageKey = `tenants/${tenantId}/${category}/${randomUUID().substring(0, 8)}-${sanitizedFileName}`;
    }

    const fileId = `file_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    // Generate presigned upload URL from centralized storage adapter
    const presignedUpload = await this.storageService.getAdapter().getUploadPresignedUrl({
      tenantId,
      key: storageKey,
      mimeType: dto.mimeType,
      maxSizeBytes: dto.sizeBytes,
      expiresInSeconds: 900,
      metadata: {
        school_id: tenantId,
        school_slug: schoolSlug,
        category,
        uploaded_by: userId,
      },
    });

    const presignedDownload = await this.storageService.getAdapter().getDownloadPresignedUrl({
      tenantId,
      key: storageKey,
      dispositionFileName: dto.originalName,
      expiresInSeconds: 900,
    });

    const fileData = await this.prisma.fileAsset.create({
      data: {
        id: fileId,
        tenantId,
        storageKey,
        originalName: dto.originalName,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        category,
        uploadedByUserId: userId,
      },
    });

    return {
      file: { ...fileData, status: 'PENDING_UPLOAD' },
      fileId,
      storageKey,
      uploadUrl: presignedUpload.uploadUrl,
      downloadUrl: presignedDownload,
      method: presignedUpload.method || 'PUT',
      expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
    };
  }

  async registerAndPresignUpload(
    tenantId: string,
    userId: string,
    dto: PresignUploadDto,
    tenantSlug?: string,
  ) {
    return this.registerFile(tenantId, userId, dto, tenantSlug);
  }

  async getFile(tenantId: string, fileId: string, tenantSlug?: string) {
    const file = await this.prisma.fileAsset.findFirst({
      where: { id: fileId, tenantId },
    });

    if (!file) {
      throw new NotFoundException('File asset not found in this school.');
    }

    // Tenant access validation
    StorageValidator.validateTenantAccess({ tenantId, slug: tenantSlug }, file.storageKey);

    const downloadUrl = await this.storageService.getAdapter().getDownloadPresignedUrl({
      tenantId,
      key: file.storageKey,
      dispositionFileName: file.originalName,
      expiresInSeconds: 3600,
    });

    return {
      ...file,
      downloadUrl,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  }

  async confirmUpload(tenantId: string, fileId: string, tenantSlug?: string) {
    const file = await this.getFile(tenantId, fileId, tenantSlug);
    const exists = await this.storageService.getAdapter().objectExists(file.storageKey);

    if (exists) {
      return { confirmed: true, status: 'READY', file: { ...file, status: 'READY' } };
    }

    return { confirmed: false, status: 'PENDING_UPLOAD', file: { ...file, status: 'PENDING_UPLOAD' } };
  }

  async getPresignedDownload(tenantId: string, fileId: string, tenantSlug?: string) {
    const file = await this.getFile(tenantId, fileId, tenantSlug);
    return {
      file,
      downloadUrl: file.downloadUrl,
      expiresAt: file.expiresAt,
    };
  }

  /**
   * Secure S3 deletion:
   * 1. Resolves target object key from trusted database record
   * 2. Verifies tenant ownership and absence of path traversal
   * 3. Deletes object from S3 bucket
   * 4. Deletes database record
   */
  async deleteFile(tenantId: string, fileId: string, tenantSlug?: string) {
    const file = await this.prisma.fileAsset.findFirst({
      where: { id: fileId, tenantId },
    });

    if (!file) {
      throw new NotFoundException('File asset not found in this school.');
    }

    // Verify tenant ownership of storage key
    StorageValidator.validateTenantAccess({ tenantId, slug: tenantSlug }, file.storageKey);

    await this.storageService.getAdapter().deleteObject(file.storageKey);

    await this.prisma.fileAsset.delete({
      where: { id: fileId },
    });

    this.logger.log(`File asset [${fileId}] key [${file.storageKey}] successfully deleted for tenant [${tenantId}]`);

    return { success: true, message: 'File asset deleted successfully' };
  }

  /**
   * Direct file buffer upload to isolated AWS S3 namespace:
   * Uploads directly to configured S3 bucket and ensures reliable delivery URL.
   */
  async saveUploadedFile(
    tenantId: string,
    userId: string,
    file: any,
    categoryName?: string,
    tenantSlug?: string,
  ) {
    if (!file || (!file.buffer && !file.data)) {
      throw new BadRequestException('No valid file content received');
    }

    const buffer: Buffer = Buffer.isBuffer(file.buffer)
      ? file.buffer
      : Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.buffer || file.data);

    const schoolSlug = await this.getSchoolSlug(tenantId, tenantSlug);
    const originalName = file.originalname || file.name || 'uploaded_image.png';

    // Route image uploads to the mandatory S3 school image pipeline
    const uploadResult = await this.storageService.uploadSchoolImage({
      schoolId: tenantId,
      schoolSlug,
      category: categoryName || 'staff-image',
      rawFileName: originalName,
      buffer,
      declaredMimeType: file.mimetype || file.type,
      userId,
    });

    const fileId = `file_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const fileData = await this.prisma.fileAsset.create({
      data: {
        id: fileId,
        tenantId,
        storageKey: uploadResult.storageKey,
        originalName,
        mimeType: uploadResult.mimeType,
        sizeBytes: uploadResult.sizeBytes,
        category: uploadResult.category,
        uploadedByUserId: userId,
      },
    });

    // Determine reliable access URL:
    // For website-image: uses direct public URL if STORAGE_DIRECT_PUBLIC_URL=true, otherwise uses backend public streaming endpoint
    let persistentUrl: string;
    if (uploadResult.category === 'website-image') {
      if (process.env.STORAGE_DIRECT_PUBLIC_URL === 'true' && uploadResult.publicUrl) {
        persistentUrl = uploadResult.publicUrl;
      } else {
        persistentUrl = `/api/v1/files/public/${fileId}`;
      }
    } else {
      persistentUrl = `/api/v1/files/view/${fileId}`;
    }

    // Local disk backup in dev mode for zero-loss resilience
    try {
      const diskDir = path.join(process.cwd(), 'uploads', schoolSlug, uploadResult.category);
      if (!fs.existsSync(diskDir)) {
        fs.mkdirSync(diskDir, { recursive: true });
      }
      fs.writeFileSync(path.join(diskDir, uploadResult.uniqueFileName), buffer);
    } catch (e: any) {
      this.logger.debug(`Local dev backup skipped: ${e?.message}`);
    }

    const downloadUrl = await this.storageService.getSchoolImageDownloadUrl(
      { tenantId, slug: schoolSlug },
      uploadResult.storageKey,
    );

    return {
      file: fileData,
      fileId,
      storageKey: uploadResult.storageKey,
      url: persistentUrl,
      downloadUrl,
    };
  }

  /**
   * Base64 / dataUrl direct image upload handler:
   * Decodes base64 payload, verifies magic bytes, and persists directly to S3.
   */
  async uploadDirectImage(
    tenantId: string,
    userId: string,
    body: { base64Data?: string; dataUrl?: string; filename?: string; category?: string },
    tenantSlug?: string,
  ) {
    const raw = body.dataUrl || body.base64Data;
    if (!raw) {
      throw new BadRequestException('Image data is required (dataUrl or base64Data)');
    }

    let mimeType = 'image/png';
    let base64String = raw;

    const match = raw.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64String = match[2];
    }

    const buffer = Buffer.from(base64String, 'base64');
    const ext = mimeType.split('/')[1] || 'png';
    const originalName = body.filename || `image_${Date.now()}.${ext}`;

    return this.saveUploadedFile(
      tenantId,
      userId,
      {
        originalname: originalName,
        mimetype: mimeType,
        buffer,
      },
      body.category || 'staff-image',
      tenantSlug,
    );
  }

  /**
   * Secure image streaming & download view:
   * Validates tenant authorization for private staff/student images before streaming or redirecting.
   * Includes resilient disk fallback for legacy uploads.
   */
  async viewFileAsset(
    tenantContextOrId: string | { tenantId?: string; slug?: string } | null,
    fileId: string,
    isSuperAdmin: boolean = false,
  ): Promise<{ buffer: Buffer; mimeType: string; size: number; isPublic: boolean }> {
    const file = await this.prisma.fileAsset.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('Requested image asset was not found.');
    }

    const isPublic = file.category === 'website-image';
    const isProfileImage = file.category === 'staff-image' || file.category === 'student-image';

    if (!isPublic && !isSuperAdmin) {
      const requestTenantId =
        typeof tenantContextOrId === 'string'
          ? tenantContextOrId
          : tenantContextOrId?.tenantId;

      // 1. Strict cross-tenant rejection: if caller claims to be another school, reject immediately
      if (requestTenantId && requestTenantId !== file.tenantId) {
        throw new ForbiddenException('Unauthorized access: this image belongs to another school organization.');
      }

      // 2. If no tenant context is attached (e.g. standard browser <img> tag loading an image),
      // allow institutional profile photos (staff/student passport pictures) requested by their exact unguessable fileId,
      // but strictly require tenant context for private documents/reports/receipts.
      if (!requestTenantId && !isProfileImage) {
        throw new ForbiddenException('Unauthorized access: tenant context is required for private documents.');
      }
    }

    let buffer: Buffer | null = null;
    let mimeType = file.mimeType || 'image/png';
    let size = file.sizeBytes || 0;

    // 1. Try downloading from storage adapter (S3 / Memory)
    try {
      const result = await this.storageService.getAdapter().downloadBuffer(file.storageKey);
      buffer = result.buffer;
      if (result.mimeType) mimeType = result.mimeType;
      if (result.size) size = result.size;
    } catch {
      // 2. Resilient fallback: check local disk in uploads/
      const possibleDiskPaths = [
        path.join(process.cwd(), 'uploads', file.storageKey),
        path.join(process.cwd(), 'uploads', 'tenants', file.tenantId, file.category, `${file.id}_${file.originalName}`),
        path.join(process.cwd(), 'uploads', 'tenants', file.tenantId, 'images', `${file.id}_${file.originalName}`),
      ];
      for (const p of possibleDiskPaths) {
        if (fs.existsSync(p)) {
          buffer = fs.readFileSync(p);
          size = buffer.length;
          break;
        }
      }
    }

    if (!buffer) {
      throw new NotFoundException('Image binary could not be retrieved from storage.');
    }

    return {
      buffer,
      mimeType,
      size,
      isPublic,
    };
  }

  /**
   * Controlled image replacement:
   * Uploads new image to S3 first, then safely cleans up previous file asset to prevent orphaned objects.
   */
  async replaceEntityImage(
    tenantId: string,
    userId: string,
    newFile: any,
    category: string,
    oldFileIdOrKey?: string,
    tenantSlug?: string,
  ) {
    const newFileResult = await this.saveUploadedFile(
      tenantId,
      userId,
      newFile,
      category,
      tenantSlug,
    );

    if (oldFileIdOrKey) {
      try {
        const oldFile = await this.prisma.fileAsset.findFirst({
          where: {
            tenantId,
            OR: [{ id: oldFileIdOrKey }, { storageKey: oldFileIdOrKey }],
          },
        });

        if (oldFile) {
          await this.deleteFile(tenantId, oldFile.id, tenantSlug);
        } else if (
          tenantSlug &&
          (oldFileIdOrKey.startsWith(`${tenantSlug}/`) || oldFileIdOrKey.startsWith(`tenants/${tenantId}/`))
        ) {
          await this.storageService.getAdapter().deleteObject(oldFileIdOrKey);
        }
      } catch (err: any) {
        this.logger.warn(`Non-blocking cleanup warning for old asset [${oldFileIdOrKey}]: ${err?.message}`);
      }
    }

    return newFileResult;
  }
}
