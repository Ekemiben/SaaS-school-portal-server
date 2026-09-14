-- Enable and configure Row-Level Security (RLS) for PostgreSQL Multi-Tenant SaaS

-- 1. Direct Tenant-Owned Tables
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Tenant" ON "Tenant"
  FOR ALL
  USING ("id" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("id" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "TenantDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantDomain" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_TenantDomain" ON "TenantDomain"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Campus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campus" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Campus" ON "Campus"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_User" ON "User"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Role" ON "Role"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Student" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Student" ON "Student"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Parent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Parent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Parent" ON "Parent"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Teacher" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Teacher" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Teacher" ON "Teacher"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "AcademicYear" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicYear" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_AcademicYear" ON "AcademicYear"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Term" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Term" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Term" ON "Term"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Class" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Class" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Class" ON "Class"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Subject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subject" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Subject" ON "Subject"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Enrollment" ON "Enrollment"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Attendance" ON "Attendance"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Examination" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Examination" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Examination" ON "Examination"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Result" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Result" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Result" ON "Result"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "GradingScale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GradingScale" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_GradingScale" ON "GradingScale"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "FeeStructure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeStructure" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_FeeStructure" ON "FeeStructure"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "FeeWaiver" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeWaiver" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_FeeWaiver" ON "FeeWaiver"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Invoice" ON "Invoice"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Payment" ON "Payment"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Payroll" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payroll" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Payroll" ON "Payroll"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Expense" ON "Expense"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "TransportRoute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransportRoute" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_TransportRoute" ON "TransportRoute"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "StudentTransportAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentTransportAllocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_StudentTransportAllocation" ON "StudentTransportAllocation"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "VehicleGpsLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VehicleGpsLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_VehicleGpsLog" ON "VehicleGpsLog"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Timetable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Timetable" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Timetable" ON "Timetable"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Homework" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Homework" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Homework" ON "Homework"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "HomeworkSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HomeworkSubmission" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_HomeworkSubmission" ON "HomeworkSubmission"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "CommunicationThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunicationThread" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_CommunicationThread" ON "CommunicationThread"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Notification" ON "Notification"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "FileAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FileAsset" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_FileAsset" ON "FileAsset"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Subscription" ON "Subscription"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "BillingInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingInvoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_BillingInvoice" ON "BillingInvoice"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_AuditLog" ON "AuditLog"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

-- 2. Child / Relation Tables
ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_RolePermission" ON "RolePermission"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "Role" WHERE "Role"."id" = "RolePermission"."roleId" AND ("Role"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "Role" WHERE "Role"."id" = "RolePermission"."roleId" AND ("Role"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_UserRole" ON "UserRole"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "UserRole"."userId" AND ("User"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "UserRole"."userId" AND ("User"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "UserCampus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserCampus" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_UserCampus" ON "UserCampus"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "UserCampus"."userId" AND ("User"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "UserCampus"."userId" AND ("User"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "StudentParent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentParent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_StudentParent" ON "StudentParent"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "Student" WHERE "Student"."id" = "StudentParent"."studentId" AND ("Student"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "Student" WHERE "Student"."id" = "StudentParent"."studentId" AND ("Student"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "ClassSubject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassSubject" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ClassSubject" ON "ClassSubject"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "Class" WHERE "Class"."id" = "ClassSubject"."classId" AND ("Class"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "Class" WHERE "Class"."id" = "ClassSubject"."classId" AND ("Class"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "ExamSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExamSchedule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ExamSchedule" ON "ExamSchedule"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "Examination" WHERE "Examination"."id" = "ExamSchedule"."examinationId" AND ("Examination"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "Examination" WHERE "Examination"."id" = "ExamSchedule"."examinationId" AND ("Examination"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "TransportStop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransportStop" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_TransportStop" ON "TransportStop"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "TransportRoute" WHERE "TransportRoute"."id" = "TransportStop"."routeId" AND ("TransportRoute"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "TransportRoute" WHERE "TransportRoute"."id" = "TransportStop"."routeId" AND ("TransportRoute"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "TimetableEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimetableEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_TimetableEntry" ON "TimetableEntry"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "Timetable" WHERE "Timetable"."id" = "TimetableEntry"."timetableId" AND ("Timetable"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "Timetable" WHERE "Timetable"."id" = "TimetableEntry"."timetableId" AND ("Timetable"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "CommunicationMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunicationMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_CommunicationMessage" ON "CommunicationMessage"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "CommunicationThread" WHERE "CommunicationThread"."id" = "CommunicationMessage"."threadId" AND ("CommunicationThread"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "CommunicationThread" WHERE "CommunicationThread"."id" = "CommunicationMessage"."threadId" AND ("CommunicationThread"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "MfaSecret" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MfaSecret" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_MfaSecret" ON "MfaSecret"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "MfaSecret"."userId" AND ("User"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "MfaSecret"."userId" AND ("User"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_PasswordResetToken" ON "PasswordResetToken"
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "PasswordResetToken"."userId" AND ("User"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "PasswordResetToken"."userId" AND ("User"."tenantId" = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on'))
    OR current_setting('app.bypass_rls', true) = 'on'
  );
