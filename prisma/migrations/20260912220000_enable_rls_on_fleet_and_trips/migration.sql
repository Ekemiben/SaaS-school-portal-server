-- Enable and configure Row-Level Security (RLS) on new Fleet and Trip tables

ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vehicle" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Vehicle" ON "Vehicle"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "TransportTrip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransportTrip" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_TransportTrip" ON "TransportTrip"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "TripBoardingRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TripBoardingRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_TripBoardingRecord" ON "TripBoardingRecord"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

-- Grant permissions to school_saas_app non-superuser role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'school_saas_app') THEN
    GRANT ALL ON TABLE "Vehicle" TO school_saas_app;
    GRANT ALL ON TABLE "TransportTrip" TO school_saas_app;
    GRANT ALL ON TABLE "TripBoardingRecord" TO school_saas_app;
  END IF;
END $$;
