export const databaseConfig = () => ({
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/school_saas?schema=public',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10),
  },
});
