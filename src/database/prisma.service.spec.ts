import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService (Production Persistence & Lifecycle)', () => {
  let prismaService: PrismaService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    process.env = originalEnv;
    if (prismaService) {
      await prismaService.onModuleDestroy();
    }
  });

  it('should initialize memory store with default seed records for development/testing', () => {
    prismaService = new PrismaService();
    expect(prismaService.isDbConnected).toBe(false);
    expect(prismaService.memoryStore.tenants.has('tenant_greenfield_100')).toBe(true);
    expect(prismaService.memoryStore.campuses.has('campus_main_01')).toBe(true);
    expect(prismaService.memoryStore.users.has('user_owner_001')).toBe(true);
  });

  it('should fail fast in production mode if PostgreSQL is unreachable', async () => {
    process.env.NODE_ENV = 'production';
    prismaService = new PrismaService();

    // Mock $connect to fail simulating unreachable PostgreSQL in production
    vi.spyOn(prismaService, '$connect').mockRejectedValue(new Error('Connection refused at port 5432'));

    await expect(prismaService.onModuleInit()).rejects.toThrow(
      /Silent fallback to memory storage is strictly prohibited in production/,
    );
    expect(prismaService.isDbConnected).toBe(false);
  });

  it('should fail fast when REQUIRE_DB is set to true and DB is unreachable', async () => {
    process.env.REQUIRE_DB = 'true';
    process.env.NODE_ENV = 'development';
    prismaService = new PrismaService();

    vi.spyOn(prismaService, '$connect').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(prismaService.onModuleInit()).rejects.toThrow(
      /Silent fallback to memory storage is strictly prohibited in production/,
    );
  });

  it('should gracefully fallback with warning in non-production mode when DB is unreachable', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.REQUIRE_DB;
    prismaService = new PrismaService();

    vi.spyOn(prismaService, '$connect').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(prismaService.onModuleInit()).resolves.toBeUndefined();
    expect(prismaService.isDbConnected).toBe(false);
  });

  it('should set isDbConnected to true when PostgreSQL connects successfully', async () => {
    prismaService = new PrismaService();

    vi.spyOn(prismaService, '$connect').mockResolvedValue(undefined as never);
    vi.spyOn(prismaService, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as never);

    await prismaService.onModuleInit();
    expect(prismaService.isDbConnected).toBe(true);
  });
});
