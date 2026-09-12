import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';

export const ALLOWED_STORAGE_CATEGORIES = [
  'documents',
  'avatars',
  'homework',
  'receipts',
  'reports',
  'exports',
  'general',
] as const;

export type StorageCategory = (typeof ALLOWED_STORAGE_CATEGORIES)[number];

export const CATEGORY_LIMITS: Record<StorageCategory, { maxSizeBytes: number; allowedMimes?: string[] }> = {
  avatars: {
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
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

  static validateTenantAccess(tenantId: string, storageKey: string): void {
    if (!tenantId || !storageKey) {
      throw new ForbiddenException('Tenant access validation failed: Missing tenant ID or storage key.');
    }

    // Path traversal defense
    if (storageKey.includes('..') || storageKey.includes('\0') || storageKey.includes('\\')) {
      throw new ForbiddenException('Path traversal attempt detected in storage key.');
    }

    const expectedPrefix = `tenants/${tenantId}/`;
    if (!storageKey.startsWith(expectedPrefix)) {
      throw new ForbiddenException(`Cross-tenant storage access violation. Target key [${storageKey}] does not belong to tenant [${tenantId}].`);
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
