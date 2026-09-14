-- Multi-Tenant PostgreSQL Row-Level Security (RLS) Migration
-- Enforces strict kernel-level tenant isolation using app.current_tenant_id

-- Helper function to set transaction-local tenant context safely
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id TEXT) RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant_id, true);
END;
$$ LANGUAGE plpgsql;

-- 1. Campus
ALTER TABLE "Campus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campus" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_campus ON "Campus";
CREATE POLICY tenant_isolation_campus ON "Campus"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 2. User
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_user ON "User";
CREATE POLICY tenant_isolation_user ON "User"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 3. Student
ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Student" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_student ON "Student";
CREATE POLICY tenant_isolation_student ON "Student"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 4. Parent
ALTER TABLE "Parent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Parent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_parent ON "Parent";
CREATE POLICY tenant_isolation_parent ON "Parent"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 5. Teacher
ALTER TABLE "Teacher" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Teacher" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_teacher ON "Teacher";
CREATE POLICY tenant_isolation_teacher ON "Teacher"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 6. AcademicYear
ALTER TABLE "AcademicYear" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicYear" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_academic_year ON "AcademicYear";
CREATE POLICY tenant_isolation_academic_year ON "AcademicYear"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 7. Term
ALTER TABLE "Term" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Term" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_term ON "Term";
CREATE POLICY tenant_isolation_term ON "Term"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 8. Class
ALTER TABLE "Class" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Class" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_class ON "Class";
CREATE POLICY tenant_isolation_class ON "Class"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 9. Subject
ALTER TABLE "Subject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subject" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_subject ON "Subject";
CREATE POLICY tenant_isolation_subject ON "Subject"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 10. Enrollment
ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_enrollment ON "Enrollment";
CREATE POLICY tenant_isolation_enrollment ON "Enrollment"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 11. Attendance
ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attendance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_attendance ON "Attendance";
CREATE POLICY tenant_isolation_attendance ON "Attendance"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 12. Examination
ALTER TABLE "Examination" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Examination" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_examination ON "Examination";
CREATE POLICY tenant_isolation_examination ON "Examination"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 13. Result
ALTER TABLE "Result" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Result" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_result ON "Result";
CREATE POLICY tenant_isolation_result ON "Result"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 14. FeeStructure
ALTER TABLE "FeeStructure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeStructure" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_fee_structure ON "FeeStructure";
CREATE POLICY tenant_isolation_fee_structure ON "FeeStructure"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 15. Invoice
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_invoice ON "Invoice";
CREATE POLICY tenant_isolation_invoice ON "Invoice"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 16. Payment
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_payment ON "Payment";
CREATE POLICY tenant_isolation_payment ON "Payment"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 17. Payroll
ALTER TABLE "Payroll" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payroll" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_payroll ON "Payroll";
CREATE POLICY tenant_isolation_payroll ON "Payroll"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 18. Expense
ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_expense ON "Expense";
CREATE POLICY tenant_isolation_expense ON "Expense"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 19. TransportRoute
ALTER TABLE "TransportRoute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransportRoute" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_transport_route ON "TransportRoute";
CREATE POLICY tenant_isolation_transport_route ON "TransportRoute"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 20. Notification
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_notification ON "Notification";
CREATE POLICY tenant_isolation_notification ON "Notification"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 21. FileAsset
ALTER TABLE "FileAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FileAsset" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_file_asset ON "FileAsset";
CREATE POLICY tenant_isolation_file_asset ON "FileAsset"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 22. Subscription
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_subscription ON "Subscription";
CREATE POLICY tenant_isolation_subscription ON "Subscription"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- 23. AuditLog
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_audit_log ON "AuditLog";
CREATE POLICY tenant_isolation_audit_log ON "AuditLog"
  AS PERMISSIVE FOR ALL
  TO PUBLIC
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), ''));
