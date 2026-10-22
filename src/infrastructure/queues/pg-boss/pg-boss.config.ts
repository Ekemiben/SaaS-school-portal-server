import { ConfigService } from '@nestjs/config';
import { ConstructorOptions } from 'pg-boss';

export interface PgBossModuleOptions {
  connectionString?: string;
  schema?: string;
  max?: number;
  retentionHours?: number;
  monitorStateIntervalSeconds?: number;
}

export const createPgBossConfig = (configService: ConfigService): ConstructorOptions => {
  // Use direct unpooled connection for LISTEN/NOTIFY and advisory locks if available
  const databaseUrl =
    process.env.DATABASE_URL_UNPOOLED ||
    configService.get<string>('database.url') ||
    process.env.DATABASE_URL ||
    '';
  const schema = configService.get<string>('queues.schema') || process.env.PG_BOSS_SCHEMA || 'pgboss';

  return {
    connectionString: databaseUrl,
    schema,
    max: 10,
    connectionTimeoutMillis: 15000,
    notifyHeartbeatIntervalMs: 30000,
    notifyHeartbeatTimeoutMs: 15000,
    notifyKeepAliveInitialDelayMs: 10000,
    retentionHours: 24,
    monitorStateIntervalSeconds: 30,
  } as ConstructorOptions;
};
