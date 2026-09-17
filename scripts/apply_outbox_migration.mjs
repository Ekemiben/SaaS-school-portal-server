import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Multi-Tenant-SaaS-Portal@localhost:5432/multi_tenant_saas?schema=public';

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();

  const ddl = `
    CREATE TABLE IF NOT EXISTS "OutboxEvent" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "eventType" TEXT NOT NULL,
        "payload" JSONB NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "retryCount" INTEGER NOT NULL DEFAULT 0,
        "lastError" TEXT,
        "lockedAt" TIMESTAMP(3),
        "lockedBy" TEXT,
        "publishedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
    );

    CREATE INDEX IF NOT EXISTS "OutboxEvent_tenantId_idx" ON "OutboxEvent"("tenantId");
    CREATE INDEX IF NOT EXISTS "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status", "createdAt");
    CREATE INDEX IF NOT EXISTS "OutboxEvent_eventType_idx" ON "OutboxEvent"("eventType");

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'OutboxEvent_tenantId_fkey'
      ) THEN
        ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenantId_fkey" 
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;

    ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "OutboxEvent" FORCE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_OutboxEvent'
      ) THEN
        CREATE POLICY "tenant_isolation_OutboxEvent" ON "OutboxEvent"
          FOR ALL
          USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
          WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');
      END IF;
    END $$;
  `;

  console.log('Applying OutboxEvent DDL...');
  await client.query(ddl);
  console.log('OutboxEvent table and RLS policy applied successfully!');
  await client.end();
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
