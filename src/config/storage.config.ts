export const storageConfig = () => ({
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'cloudflare-r2',
    endpoint: process.env.STORAGE_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT || undefined,
    bucket: process.env.STORAGE_BUCKET || process.env.CLOUDFLARE_R2_BUCKET || 'school-saas-documents',
    region: process.env.STORAGE_REGION || process.env.CLOUDFLARE_R2_REGION || 'auto',
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
    publicDomain: process.env.STORAGE_PUBLIC_DOMAIN || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN || undefined,
    presignedUploadExpiresSeconds: parseInt(process.env.STORAGE_PRESIGNED_UPLOAD_EXPIRES || '900', 10),
    presignedDownloadExpiresSeconds: parseInt(process.env.STORAGE_PRESIGNED_DOWNLOAD_EXPIRES || '3600', 10),
    maxFileSizeBytes: parseInt(process.env.STORAGE_MAX_FILE_SIZE_BYTES || '52428800', 10), // 50MB default
  },
});
