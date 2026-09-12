export const storageConfig = () => ({
  storage: {
    provider: (process.env.STORAGE_PROVIDER || 's3').toLowerCase(),
    bucket: process.env.STORAGE_BUCKET || 'school-saas-documents',
    region: process.env.STORAGE_REGION || 'us-east-1',
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || '',
    presignedUrlExpiresSeconds: parseInt(process.env.STORAGE_PRESIGNED_EXPIRES || '900', 10),
    gcsProjectId: process.env.STORAGE_GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || undefined,
    gcsKeyFilename: process.env.STORAGE_GCS_KEYFILE || undefined,
    requireStorage: process.env.REQUIRE_STORAGE === 'true',
  },
});
