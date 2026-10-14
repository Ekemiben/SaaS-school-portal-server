import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID, randomBytes } from 'crypto';

export const ALLOWED_STORAGE_CATEGORIES = [
  'documents',
  'avatars',
  'homework',
  'receipts',
  'reports',
  'exports',
  'general',
  'staff-image',
  'student-image',
  'website-image',
] as const;

export type StorageCategory = (typeof ALLOWED_STORAGE_CATEGORIES)[number];

export const SCHOOL_IMAGE_CATEGORIES = [
  'staff-image',
  'student-image',
  'website-image',
] as const;

export type SchoolImageCategory = (typeof SCHOOL_IMAGE_CATEGORIES)[number];

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const CATEGORY_LIMITS: Record<StorageCategory, { maxSizeBytes: number; allowedMimes?: string[] }> = {
  avatars: {
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
  'staff-image': {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
  'student-image': {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
  'website-image': {
    maxSizeBytes: 15 * 1024 * 1024, // 15MB
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
  },
  homework: {
    maxSizeBytes: 25 * 1024 * 1024, // 25MB
    allowedMimes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'text/plain',
    ],
  },
  receipts: {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  reports: {
    maxSizeBytes: 50 * 1024 * 1024, // 50MB
    allowedMimes: [
      'application/pdf',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  exports: {
    maxSizeBytes: 100 * 1024 * 1024, // 100MB
    allowedMimes: [
      'application/zip',
      'text/csv',
      'application/json',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  documents: {
    maxSizeBytes: 50 * 1024 * 1024, // 50MB
    allowedMimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'text/plain',
    ],
  },
  general: {
    maxSizeBytes: 50 * 1024 * 1024, // 50MB
  },
};

const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.msi', '.vbs', '.js', '.jsx', '.ts', '.tsx',
  '.html', '.htm', '.php', '.phtml', '.py', '.rb', '.com', '.scr', '.jar',
];

export class StorageValidator {
  /**
   * Resolves raw category strings and legacy aliases to mandatory canonical image categories:
   * 'staff-image', 'student-image', 'website-image'.
   * Rejects invalid or unmapped categories.
   */
  static resolveImageCategory(category?: string): SchoolImageCategory {
    if (!category || typeof category !== 'string') {
      throw new BadRequestException('Image category is required. Permitted: staff-image, student-image, website-image.');
    }

    const normalized = category.toLowerCase().trim();

    // Direct matches
    if (normalized === 'staff-image' || normalized === 'staff' || normalized === 'avatars') {
      return 'staff-image';
    }

    if (normalized === 'student-image' || normalized === 'student' || normalized === 'students') {
      return 'student-image';
    }

    if (
      normalized === 'website-image' ||
      normalized === 'website' ||
      normalized === 'branding' ||
      normalized === 'gallery' ||
      normalized === 'campus' ||
      normalized === 'hero' ||
      normalized === 'principal' ||
      normalized === 'signatures' ||
      normalized === 'stamps' ||
      normalized === 'images'
    ) {
      return 'website-image';
    }

    throw new BadRequestException(
      `Invalid image category [${category}]. Permitted categories: ${SCHOOL_IMAGE_CATEGORIES.join(', ')}`,
    );
  }

  /**
   * Inspects binary buffer magic bytes to ensure file is genuinely a permitted image format
   * (JPEG, PNG, WEBP, GIF). Prevents disguised executable uploads.
   */
  static detectAndValidateImageSignature(
    buffer: Buffer,
    declaredMimeType?: string,
  ): { mimeType: string; extension: string } {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Empty image file received.');
    }

    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      const maxMb = Math.round(MAX_IMAGE_SIZE_BYTES / (1024 * 1024));
      throw new BadRequestException(
        `Image size (${buffer.length} bytes) exceeds maximum permitted limit (${maxMb}MB).`,
      );
    }

    if (buffer.length < 4) {
      throw new BadRequestException('Image file is corrupted or too small to be a valid image.');
    }

    // 1. JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mimeType: 'image/jpeg', extension: 'jpg' };
    }

    // 2. PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return { mimeType: 'image/png', extension: 'png' };
    }

    // 3. GIF: GIF87a or GIF89a
    if (
      buffer.length >= 6 &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38 &&
      (buffer[4] === 0x37 || buffer[4] === 0x39) &&
      buffer[5] === 0x61
    ) {
      return { mimeType: 'image/gif', extension: 'gif' };
    }

    // 4. WEBP: RIFF....WEBP
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return { mimeType: 'image/webp', extension: 'webp' };
    }

    // 5. SVG (Text XML starting with <?xml or <svg)
    if (declaredMimeType?.includes('svg') || declaredMimeType === 'image/svg+xml') {
      const head = buffer.subarray(0, 100).toString('utf-8').trim();
      if (head.startsWith('<?xml') || head.startsWith('<svg') || head.includes('<svg')) {
        // Disallow dangerous script tags in SVG
        const fullContent = buffer.toString('utf-8');
        if (/<script|onload|onerror|onclick/i.test(fullContent)) {
          throw new BadRequestException('Embedded scripts detected in SVG file. Upload rejected.');
        }
        return { mimeType: 'image/svg+xml', extension: 'svg' };
      }
    }

    throw new BadRequestException(
      'Invalid file format. File signature does not match any permitted image type (JPEG, PNG, WEBP, GIF).',
    );
  }

  /**
   * Sanitizes a client-provided filename and strips directory traversal.
   */
  static sanitizeFileName(rawName: string): string {
    if (!rawName || typeof rawName !== 'string') {
      throw new BadRequestException('Invalid original file name.');
    }
    // Replace slashes, null bytes, backslashes with underscores, and strip path traversal sequences
    let cleaned = rawName.replace(/[\0/\\]+/g, '_').replace(/\.\.+/g, '').trim();
    // Normalize and remove characters outside safe alphanumeric, dashes, dots, underscores
    cleaned = cleaned.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.\.+/g, '');
    cleaned = cleaned.replace(/^_+|_+$/g, '');
    if (!cleaned || cleaned === '.' || cleaned === '..') {
      cleaned = `file_${randomUUID().substring(0, 8)}`;
    }

    const lower = cleaned.toLowerCase();
    for (const ext of DANGEROUS_EXTENSIONS) {
      if (lower.endsWith(ext)) {
        throw new BadRequestException(`Uploaded files with executable extension [${ext}] are strictly prohibited.`);
      }
    }

    return cleaned;
  }

  /**
   * Generates a collision-resistant unique filename matching the schema:
   * e.g. 'staff-123-a81f29.jpg', 'student-456-b29c10.jpg', 'home-banner-c31d44.webp'
   */
  static generateUniqueImageFilename(
    category: SchoolImageCategory,
    extension: string,
    entityIdOrHint?: string,
    originalName?: string,
  ): string {
    const cleanExt = (extension || 'jpg').replace(/^\.+/, '').toLowerCase();
    const randomHex = randomBytes(3).toString('hex');

    let prefix = 'image';
    if (category === 'staff-image') prefix = 'staff';
    else if (category === 'student-image') prefix = 'student';
    else if (category === 'website-image') {
      if (originalName) {
        const sanitizedBase = originalName
          .split('.')[0]
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 20);
        prefix = sanitizedBase || 'website';
      } else {
        prefix = 'website';
      }
    }

    const idPart = entityIdOrHint
      ? entityIdOrHint.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 16)
      : randomUUID().replace(/-/g, '').slice(0, 8);

    return `${prefix}-${idPart}-${randomHex}.${cleanExt}`;
  }

  /**
   * Constructs the authoritative S3 object key adhering to the mandatory schema:
   * {school-storage-identifier}/{category}/{unique-filename}
   */
  static buildSchoolImageKey(
    schoolSlugOrId: string,
    category: SchoolImageCategory,
    uniqueFilename: string,
  ): string {
    if (!schoolSlugOrId || typeof schoolSlugOrId !== 'string') {
      throw new BadRequestException('Invalid school storage identifier.');
    }

    const normalizedSchool = schoolSlugOrId.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (!normalizedSchool) {
      throw new BadRequestException('Normalized school storage identifier cannot be empty.');
    }

    const cleanFilename = this.sanitizeFileName(uniqueFilename);
    return `${normalizedSchool}/${category}/${cleanFilename}`;
  }

  /**
   * Constructs standard tenant document storage key for non-image assets.
   */
  static buildTenantStorageKey(tenantId: string, category: string, rawFileName: string): string {
    if (!tenantId || typeof tenantId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      throw new BadRequestException('Invalid tenant identifier for storage key.');
    }

    const normalizedCategory = (category || 'documents').toLowerCase() as StorageCategory;
    const cat = ALLOWED_STORAGE_CATEGORIES.includes(normalizedCategory) ? normalizedCategory : 'documents';
    const sanitizedName = this.sanitizeFileName(rawFileName);
    const uniquePrefix = randomUUID().replace(/-/g, '').substring(0, 16);

    return `tenants/${tenantId}/${cat}/${uniquePrefix}-${sanitizedName}`;
  }

  /**
   * Validates that the requested storage key strictly belongs to the authenticated school/tenant.
   * Protects against cross-school access violations and path traversal.
   */
  static validateTenantAccess(
    tenantContextOrId: string | { tenantId?: string; slug?: string },
    storageKey: string,
  ): void {
    if (!tenantContextOrId || !storageKey) {
      throw new ForbiddenException('Tenant access validation failed: Missing tenant ID or storage key.');
    }

    // Path traversal defense
    if (storageKey.includes('..') || storageKey.includes('\0') || storageKey.includes('\\')) {
      throw new ForbiddenException('Path traversal attempt detected in storage key.');
    }

    const tenantId = typeof tenantContextOrId === 'string' ? tenantContextOrId : tenantContextOrId.tenantId;
    const slug = typeof tenantContextOrId === 'object' ? tenantContextOrId.slug : undefined;

    const validPrefixes: string[] = [];
    if (tenantId) {
      validPrefixes.push(`tenants/${tenantId}/`);
      validPrefixes.push(`${tenantId}/`);
    }
    if (slug) {
      const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
      validPrefixes.push(`${cleanSlug}/`);
      validPrefixes.push(`tenants/${cleanSlug}/`);
    }

    const matches = validPrefixes.some((p) => storageKey.startsWith(p));
    if (!matches) {
      throw new ForbiddenException(
        `Cross-tenant storage access violation. Target key [${storageKey}] does not belong to school tenant [${slug || tenantId}].`,
      );
    }
  }

  static validateCategoryAndLimits(category: string, mimeType: string, sizeBytes: number): void {
    const normCategory = (category || 'documents').toLowerCase() as StorageCategory;
    const config = CATEGORY_LIMITS[normCategory] || CATEGORY_LIMITS.documents;

    if (sizeBytes <= 0) {
      throw new BadRequestException('File size must be greater than 0 bytes.');
    }

    if (sizeBytes > config.maxSizeBytes) {
      const maxMb = Math.round(config.maxSizeBytes / (1024 * 1024));
      throw new BadRequestException(`File size (${sizeBytes} bytes) exceeds maximum allowed for category [${normCategory}] (${maxMb}MB).`);
    }

    if (config.allowedMimes && config.allowedMimes.length > 0) {
      const normalizedMime = mimeType?.toLowerCase().trim();
      if (!normalizedMime || !config.allowedMimes.includes(normalizedMime)) {
        throw new BadRequestException(
          `MIME type [${mimeType}] is not permitted for category [${normCategory}]. Permitted: ${config.allowedMimes.join(', ')}`,
        );
      }
    }
  }
}
