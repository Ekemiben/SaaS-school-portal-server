-- Migration: 20260916120000_platform_super_admin_architecture
-- Allow tenantId to be NULL for platform-scoped users and roles

-- 1. Alter User table
ALTER TABLE "User" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "platformRole" TEXT;

-- 2. Alter Role table
ALTER TABLE "Role" ALTER COLUMN "tenantId" DROP NOT NULL;

-- 3. Create partial unique index on User email for platform users (where tenantId IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "User_platform_email_unique" ON "User"("email") WHERE "tenantId" IS NULL;

-- 4. Create partial unique index on Role name for platform roles (where tenantId IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "Role_platform_name_unique" ON "Role"("name") WHERE "tenantId" IS NULL;

-- 5. Update RLS policies for User and Role to strictly prevent tenant leakage of platform records
DROP POLICY IF EXISTS "tenant_isolation_User" ON "User";
CREATE POLICY "tenant_isolation_User" ON "User"
  FOR ALL
  USING (
    ("tenantId" IS NOT NULL AND "tenantId" = current_setting('app.current_tenant_id', true))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    ("tenantId" IS NOT NULL AND "tenantId" = current_setting('app.current_tenant_id', true))
    OR current_setting('app.bypass_rls', true) = 'on'
  );

DROP POLICY IF EXISTS "tenant_isolation_Role" ON "Role";
CREATE POLICY "tenant_isolation_Role" ON "Role"
  FOR ALL
  USING (
    ("tenantId" IS NOT NULL AND "tenantId" = current_setting('app.current_tenant_id', true))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    ("tenantId" IS NOT NULL AND "tenantId" = current_setting('app.current_tenant_id', true))
    OR current_setting('app.bypass_rls', true) = 'on'
  );
