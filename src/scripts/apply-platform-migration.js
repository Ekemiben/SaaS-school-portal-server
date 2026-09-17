import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:Multi-Tenant-SaaS-Portal@localhost:5432/multi_tenant_saas?schema=public';

async function run() {
  console.log('[MIGRATION] Connecting to PostgreSQL database:', dbUrl);
  const pool = new pg.Pool({ connectionString: dbUrl });

  try {
    const migrationFile = path.resolve(__dirname, '../../prisma/migrations/20260916120000_platform_super_admin_architecture/migration.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('[MIGRATION] Executing migration SQL...');
    await pool.query(sql);
    console.log('[MIGRATION] ✅ Platform super admin migration successfully applied to PostgreSQL database.');
  } catch (err) {
    console.error('[MIGRATION] ❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

run();
