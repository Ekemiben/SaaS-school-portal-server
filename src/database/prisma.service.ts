import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { populateDefaultMemoryStore } from './default-memory-data.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public isDbConnected = false;
  private pool?: Pool;

  // In-memory backing stores for operational resilience in dev/test when DB is not yet provisioned
  public memoryStore = {
    tenants: new Map<string, any>(),
    domains: new Map<string, any>(),
    campuses: new Map<string, any>(),
    users: new Map<string, any>(),
    roles: new Map<string, any>(),
    permissions: new Map<string, any>(),
    students: new Map<string, any>(),
    parents: new Map<string, any>(),
    teachers: new Map<string, any>(),
    academicYears: new Map<string, any>(),
    terms: new Map<string, any>(),
    classes: new Map<string, any>(),
    subjects: new Map<string, any>(),
    enrollments: new Map<string, any>(),
    attendance: new Map<string, any>(),
    examinations: new Map<string, any>(),
    results: new Map<string, any>(),
    feeStructures: new Map<string, any>(),
    invoices: new Map<string, any>(),
    payments: new Map<string, any>(),
    payroll: new Map<string, any>(),
    expenses: new Map<string, any>(),
    transportRoutes: new Map<string, any>(),
    notifications: new Map<string, any>(),
    fileAssets: new Map<string, any>(),
    subscriptions: new Map<string, any>(),
    auditLogs: new Map<string, any>(),
    timetables: new Map<string, any>(),
    timetableEntries: new Map<string, any>(),
    homework: new Map<string, any>(),
    homeworkSubmissions: new Map<string, any>(),
    communications: new Map<string, any>(),
    communicationThreads: new Map<string, any>(),
    billingInvoices: new Map<string, any>(),
    gradingScales: new Map<string, any>(),
    feeWaivers: new Map<string, any>(),
    classSubjects: new Map<string, any>(),
    mfaSecrets: new Map<string, any>(),
    resetTokens: new Map<string, any>(),
  };

  constructor() {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/school_saas?schema=public';

    const maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10);
    const idleTimeoutMillis = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
    const connectionTimeoutMillis = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10);

    const pool = new Pool({
      connectionString,
      max: maxConnections,
      idleTimeoutMillis,
      connectionTimeoutMillis,
    });

    pool.on('error', (err) => {
      new Logger(PrismaService.name).error('Unexpected PostgreSQL client pool error:', err);
    });

    const adapter = new PrismaPg(pool);
    super({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    this.pool = pool;
    populateDefaultMemoryStore(this.memoryStore);
  }

  async onModuleInit() {
    try {
      await this.$connect();
      // Verify live connection with a probe query
      await this.$queryRaw`SELECT 1;`;
      this.isDbConnected = true;
      this.logger.log('Successfully connected to production PostgreSQL via Prisma ORM.');
    } catch (error: any) {
      this.isDbConnected = false;
      const isProduction =
        process.env.NODE_ENV === 'production' || process.env.REQUIRE_DB === 'true';

      if (isProduction) {
        const errorMsg = `CRITICAL: PostgreSQL connection failed in production mode (${error?.message}). Silent fallback to memory storage is strictly prohibited in production.`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      this.logger.warn(
        `PostgreSQL not reachable at DATABASE_URL (${error?.message}). Running in resilient fallback mode with in-memory persistence for dev/test.`,
      );
    }
  }

  isPostgresConnected(): boolean {
    return this.isDbConnected;
  }

  async onModuleDestroy() {
    if (this.isDbConnected) {
      await this.$disconnect();
    }
    if (this.pool) {
      await this.pool.end();
    }
  }
}
