import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const email = (process.env.SUPERADMIN_EMAIL || 'superadmin@platform.io').toLowerCase().trim();
const passwordPlain = process.env.SUPERADMIN_PASSWORD || 'SuperAdminSecret2026!';
const firstName = process.env.SUPERADMIN_FIRSTNAME || 'Platform';
const lastName = process.env.SUPERADMIN_LASTNAME || 'SuperAdmin';

async function bootstrap() {
  console.log(`[BOOTSTRAP] Initializing Platform SUPER_ADMIN account: ${email}`);

  let prisma: PrismaClient | null = null;
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:Multi-Tenant-SaaS-Portal@localhost:5432/multi_tenant_saas?schema=public';

  if (dbUrl) {
    try {
      const pool = new pg.Pool({ connectionString: dbUrl });
      const adapter = new PrismaPg(pool);
      prisma = new PrismaClient({ adapter } as any);
      await prisma.$connect();
      console.log('[BOOTSTRAP] Connected to PostgreSQL database.');
    } catch (err: any) {
      console.warn(`[BOOTSTRAP] Could not connect to PostgreSQL: ${err.message}.`);
      prisma = null;
    }
  }

  const passwordHash = await bcrypt.hash(passwordPlain, 12);
  const userId = `usr_super_${randomUUID().replace(/-/g, '').substring(0, 16)}`;

  if (prisma) {
    try {
      // Find existing super admin by email where tenantId is null
      const existing = await prisma.user.findFirst({
        where: { email, tenantId: null },
      });

      if (existing) {
        console.log(`[BOOTSTRAP] Super Admin account already exists (ID: ${existing.id}). Updating credentials and activating...`);
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            firstName,
            lastName,
            isActive: true,
            isPlatformAdmin: true,
            platformRole: 'SUPER_ADMIN',
          },
        });
        console.log(`[BOOTSTRAP] Successfully updated SUPER_ADMIN (ID: ${existing.id}).`);
      } else {
        const created = await prisma.user.create({
          data: {
            id: userId,
            tenantId: null,
            email,
            passwordHash,
            firstName,
            lastName,
            isActive: true,
            isPlatformAdmin: true,
            platformRole: 'SUPER_ADMIN',
          },
        });
        console.log(`[BOOTSTRAP] Successfully created new SUPER_ADMIN (ID: ${created.id}).`);
      }
    } catch (err: any) {
      console.error(`[BOOTSTRAP] Database operation error: ${err.message}`);
    } finally {
      await prisma.$disconnect();
    }
  } else {
    console.log(`[BOOTSTRAP] Running in local/test memory mode. Memory representation initialized for: ${email}`);
  }

  console.log('\n======================================================');
  console.log('✅ PLATFORM SUPER_ADMIN BOOTSTRAP COMPLETE');
  console.log(`Email:        ${email}`);
  console.log(`Role:         SUPER_ADMIN (tenantId = NULL)`);
  console.log(`Scope:        PLATFORM`);
  console.log(`Login URL:    POST /api/v1/auth/platform/login`);
  console.log('======================================================\n');
}

bootstrap().catch((err) => {
  console.error('[BOOTSTRAP] Fatal bootstrap error:', err);
  process.exit(1);
});
