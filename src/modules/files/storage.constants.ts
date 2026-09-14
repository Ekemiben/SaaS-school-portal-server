export const ALLOWED_FILE_CATEGORIES = [
  'avatars',
  'documents',
  'assignments',
  'reports',
  'receipts',
  'exports',
] as const;

export type FileCategory = (typeof ALLOWED_FILE_CATEGORIES)[number];

export const CATEGORY_SIZE_LIMITS: Record<FileCategory, number> = {
  avatars: 5 * 1024 * 1024,        // 5MB
  documents: 25 * 1024 * 1024,     // 25MB
  assignments: 50 * 1024 * 1024,   // 50MB
  reports: 50 * 1024 * 1024,       // 50MB
  receipts: 10 * 1024 * 1024,      // 10MB
  exports: 100 * 1024 * 1024,      // 100MB
};

export const ALLOWED_MIME_TYPES = new Set([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
]);
