-- Enable and configure Row-Level Security (RLS) on StaffSalaryProfile table

ALTER TABLE "StaffSalaryProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffSalaryProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_StaffSalaryProfile" ON "StaffSalaryProfile"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

-- Grant permissions to school_saas_app non-superuser role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'school_saas_app') THEN
    GRANT ALL ON TABLE "StaffSalaryProfile" TO school_saas_app;
  END IF;
END $$;
