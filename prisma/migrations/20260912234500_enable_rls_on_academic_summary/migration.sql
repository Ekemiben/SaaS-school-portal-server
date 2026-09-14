-- Enable and configure Row-Level Security (RLS) on AcademicSummary table

ALTER TABLE "AcademicSummary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicSummary" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_AcademicSummary" ON "AcademicSummary"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

-- Grant permissions to school_saas_app non-superuser role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'school_saas_app') THEN
    GRANT ALL ON TABLE "AcademicSummary" TO school_saas_app;
  END IF;
END $$;
