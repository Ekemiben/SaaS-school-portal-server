import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { defaultMemoryStoreData } from './default-memory-store.data.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public isDbConnected = false;
  private pool: pg.Pool | null = null;

  public memoryStore = defaultMemoryStoreData();

  constructor() {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://postgres:Multi-Tenant-SaaS-Portal@localhost:5432/multi_tenant_saas?schema=public';

    const maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10);
    const idleTimeoutMs = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
    const connectionTimeoutMs = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10);

    const pool = new pg.Pool({
      connectionString,
      max: maxConnections,
      idleTimeoutMillis: idleTimeoutMs,
      connectionTimeoutMillis: connectionTimeoutMs,
    });

    const adapter = new PrismaPg(pool);
    super({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    this.pool = pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1;`;
      await this.ensureRlsApplicationRole();
      this.isDbConnected = true;
      this.logger.log('Successfully connected to production PostgreSQL via Prisma ORM and pg.Pool.');
    } catch (error: any) {
      this.isDbConnected = false;
      if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_DB === 'true') {
        this.logger.error(`Critical: Unable to connect to PostgreSQL: ${error?.message}`);
        throw new Error(
          `Critical: Silent fallback to memory storage is strictly prohibited in production mode. Production PostgreSQL connection failure: ${error?.message}`,
        );
      }
      this.logger.warn(
        `PostgreSQL not reachable at DATABASE_URL (${error?.message}). Running in non-production fallback mode with in-memory persistence.`,
      );
    }
  }

  private async ensureRlsApplicationRole() {
    try {
      await this.$executeRawUnsafe(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'school_saas_app') THEN 
            CREATE ROLE school_saas_app NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT; 
          END IF; 
        END $$;
        GRANT USAGE ON SCHEMA public TO school_saas_app;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO school_saas_app;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO school_saas_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO school_saas_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO school_saas_app;
      `);
    } catch (err: any) {
      this.logger.warn(`Could not verify school_saas_app role: ${err?.message}`);
    }
  }

  async onModuleDestroy() {
    try {
      if (this.isDbConnected) {
        await this.$disconnect();
      }
    } finally {
      if (this.pool) {
        await this.pool.end();
      }
    }
  }
}
