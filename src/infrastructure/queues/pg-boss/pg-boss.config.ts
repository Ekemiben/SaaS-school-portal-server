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
  const databaseUrl = configService.get<string>('database.url') || process.env.DATABASE_URL || '';
  const schema = configService.get<string>('queues.schema') || process.env.PG_BOSS_SCHEMA || 'pgboss';

  return {
    connectionString: databaseUrl,
    schema,
    max: 10,
    retentionHours: 24,
    monitorStateIntervalSeconds: 30,
  } as ConstructorOptions;
};
