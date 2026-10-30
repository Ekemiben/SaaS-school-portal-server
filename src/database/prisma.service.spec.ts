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

  it('should initialize with isDbConnected set to false prior to onModuleInit', () => {
    prismaService = new PrismaService();
    expect(prismaService.isDbConnected).toBe(false);
  });

  it('should fail fast in production mode if PostgreSQL is unreachable', async () => {
    process.env.NODE_ENV = 'production';
    prismaService = new PrismaService();

    vi.spyOn(prismaService, '$connect').mockRejectedValue(new Error('Connection refused at port 5432'));

    await expect(prismaService.onModuleInit()).rejects.toThrow(
      /Critical: Database connection is strictly required in production mode/,
    );
    expect(prismaService.isDbConnected).toBe(false);
  });

  it('should fail fast when PostgreSQL connection fails during onModuleInit', async () => {
    process.env.REQUIRE_DB = 'true';
    process.env.NODE_ENV = 'development';
    prismaService = new PrismaService();

    vi.spyOn(prismaService, '$connect').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(prismaService.onModuleInit()).rejects.toThrow(
      /Critical: Database connection is strictly required in production mode/,
    );
  });

  it('should set isDbConnected to true when PostgreSQL connects successfully', async () => {
    prismaService = new PrismaService();

    vi.spyOn(prismaService, '$connect').mockResolvedValue(undefined as never);
    vi.spyOn(prismaService, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as never);
    vi.spyOn(prismaService, '$executeRawUnsafe').mockResolvedValue(0 as never);

    await prismaService.onModuleInit();
    expect(prismaService.isDbConnected).toBe(true);
  });
});
