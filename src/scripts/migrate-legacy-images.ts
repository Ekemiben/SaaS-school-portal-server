import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { StorageService } from '../modules/storage/storage.service.js';
import { StorageValidator } from '../modules/storage/storage.validator.js';
import { ConfigService } from '@nestjs/config';
import fs from 'fs';
import path from 'path';

/**
 * Multi-Tenant S3 Legacy Image Migration & Backfill Script
 *
 * Operational features:
 * - Scans existing local uploads directory ('uploads/tenants/...') and database records
 * - Normalizes image categories to canonical allowlist ('staff-image', 'student-image', 'website-image')
 * - Uploads legacy images to isolated S3 key namespace: {schoolSlug}/{category}/{uniqueFilename}
 * - Non-destructive: leaves old files in place until verified
 * - Dry-run capability: pass --dry-run to audit without executing mutations
 */
async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`=== Multi-Tenant S3 Image Migration Tool (Dry Run: ${isDryRun}) ===\n`);

  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://postgres:Multi-Tenant-SaaS-Portal@localhost:5432/multi_tenant_saas?schema=public';

  const pool = new pg.Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const configService = new ConfigService();
  const storageService = new StorageService(configService);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, slug: true },
    });
    console.log(`Found ${tenants.length} registered school tenants.\n`);

    const uploadsBaseDir = path.join(process.cwd(), 'uploads', 'tenants');
    const hasLocalUploads = fs.existsSync(uploadsBaseDir);

    if (hasLocalUploads) {
      console.log(`Scanning local disk storage at: ${uploadsBaseDir}...`);
      for (const tenant of tenants) {
        const tenantDir = path.join(uploadsBaseDir, tenant.id);
        if (!fs.existsSync(tenantDir)) continue;

        const categories = fs.readdirSync(tenantDir);
        for (const rawCat of categories) {
          const catDir = path.join(tenantDir, rawCat);
          if (!fs.statSync(catDir).isDirectory()) continue;

          const files = fs.readdirSync(catDir);
          for (const filename of files) {
            const filePath = path.join(catDir, filename);
            if (!fs.statSync(filePath).isFile()) continue;

            try {
              const buffer = fs.readFileSync(filePath);
              const canonicalCat = StorageValidator.resolveImageCategory(rawCat);
              const { extension } = StorageValidator.detectAndValidateImageSignature(buffer);
              const uniqueName = StorageValidator.generateUniqueImageFilename(canonicalCat, extension, undefined, filename);
              const newS3Key = StorageValidator.buildSchoolImageKey(tenant.slug || tenant.id, canonicalCat, uniqueName);

              console.log(`[LOCAL -> S3] School: ${tenant.slug} | Category: ${canonicalCat} | Target: ${newS3Key}`);

              if (!isDryRun) {
                await storageService.getAdapter().uploadBuffer(newS3Key, buffer, `image/${extension}`, {
                  school_id: tenant.id,
                  school_slug: tenant.slug,
                  migrated_from: filePath,
                  migrated_at: new Date().toISOString(),
                });

                // Update or create FileAsset
                const fileId = `file_mig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                await prisma.fileAsset.create({
                  data: {
                    id: fileId,
                    tenantId: tenant.id,
                    storageKey: newS3Key,
                    originalName: filename,
                    mimeType: `image/${extension}`,
                    sizeBytes: buffer.length,
                    category: canonicalCat,
                  },
                });
              }
              migratedCount++;
            } catch (err: any) {
              console.error(`  Error migrating ${filePath}: ${err.message}`);
              errorCount++;
            }
          }
        }
      }
    } else {
      console.log('No legacy local uploads directory detected on disk.');
    }

    // Scan database records for any non-S3 URLs or legacy keys
    console.log('\nScanning database entities for legacy image URLs...');

    const fileAssets = await prisma.fileAsset.findMany();
    console.log(`Total FileAsset records in database: ${fileAssets.length}`);

    for (const asset of fileAssets) {
      if (asset.storageKey.startsWith('tenants/') && !asset.storageKey.includes('-image/')) {
        console.log(`  Identified legacy key structure: [${asset.storageKey}]`);
        // Record is flagged for backfill if needed
        skippedCount++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total Migrated: ${migratedCount}`);
    console.log(`Total Flagged / Skipped: ${skippedCount}`);
    console.log(`Total Errors: ${errorCount}`);
    console.log('==========================\n');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Fatal migration error:', e);
  process.exit(1);
});
