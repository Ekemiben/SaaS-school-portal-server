import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { DatabaseSeederService } from '../src/database/seeder.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';

describe('Production PostgreSQL Persistence (Task 1)', () => {
  let prisma: PrismaService;
  let seeder: DatabaseSeederService;
  let rlsHelper: RlsHelper;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    seeder = new DatabaseSeederService(prisma);
    rlsHelper = new RlsHelper(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('should establish a healthy live connection to PostgreSQL', async () => {
    expect(prisma.isDbConnected).toBe(true);
    const result = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result;`;
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should execute schema queries and interact with PostgreSQL tables', async () => {
    const permissionsCount = await seeder.seedSystemPermissions();
    expect(permissionsCount).toBeGreaterThan(0);

    const dbPermissions = await prisma.permission.findMany();
    expect(dbPermissions.length).toBeGreaterThanOrEqual(permissionsCount);
  });

  it('should execute queries within transactional boundaries', async () => {
    const testResult = await prisma.$transaction(async (tx) => {
      const perms = await tx.permission.findMany({ take: 3 });
      return perms;
    });

    expect(testResult).toBeDefined();
    expect(Array.isArray(testResult)).toBe(true);
  });

  it('should support tenant RLS context wrapping via RlsHelper', async () => {
    const testTenantId = 'tenant_test_pg_pers_001';
    const executed = await rlsHelper.withTenantContext(testTenantId, async (txPrisma) => {
      const count = await txPrisma.permission.count();
      return count;
    });

    expect(executed).toBeGreaterThan(0);
  });

  it('should throw an error in production mode if database connection fails', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevUrl = process.env.DATABASE_URL;

    try {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://invalid_user:invalid_pass@127.0.0.1:9999/non_existent_db';

      const faultyPrisma = new PrismaService();
      await expect(faultyPrisma.onModuleInit()).rejects.toThrow(/Production PostgreSQL connection failure/);
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.DATABASE_URL = prevUrl;
    }
  });

  it('should fall back to in-memory store in non-production mode if database is unreachable', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevUrl = process.env.DATABASE_URL;

    try {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://invalid_user:invalid_pass@127.0.0.1:9999/non_existent_db';

      const fallbackPrisma = new PrismaService();
      await fallbackPrisma.onModuleInit();

      expect(fallbackPrisma.isDbConnected).toBe(false);
      expect(fallbackPrisma.memoryStore.tenants.size).toBeGreaterThan(0);
      await fallbackPrisma.onModuleDestroy();
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.DATABASE_URL = prevUrl;
    }
  });
});
