export const SystemPermissions = {
  // Tenancy & Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',
  DOMAINS_MANAGE: 'domains.manage',
  SUBSCRIPTION_MANAGE: 'subscription.manage',

  // Users & Roles
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',

  // Campuses
  CAMPUSES_VIEW: 'campuses.view',
  CAMPUSES_MANAGE: 'campuses.manage',

  // Students
  STUDENTS_VIEW: 'students.view',
  STUDENTS_CREATE: 'students.create',
  STUDENTS_UPDATE: 'students.update',
  STUDENTS_DELETE: 'students.delete',

  // Parents
  PARENTS_VIEW: 'parents.view',
  PARENTS_MANAGE: 'parents.manage',

  // Teachers
  TEACHERS_VIEW: 'teachers.view',
  TEACHERS_MANAGE: 'teachers.manage',

  // Academics
  ACADEMICS_VIEW: 'academics.view',
  ACADEMICS_MANAGE: 'academics.manage',

  // Attendance
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MARK: 'attendance.mark',

  // Examinations & Results
  EXAMINATIONS_MANAGE: 'examinations.manage',
  RESULTS_ENTER: 'results.enter',
  RESULTS_APPROVE: 'results.approve',
  RESULTS_PUBLISH: 'results.publish',

  // Fees & Finance
  FEES_VIEW: 'fees.view',
  FEES_CREATE: 'fees.create',
  FEES_MANAGE: 'fees.manage',
  INVOICES_MANAGE: 'invoices.manage',
  PAYMENTS_VIEW: 'payments.view',
  PAYMENTS_REFUND: 'payments.refund',
  EXPENSES_MANAGE: 'expenses.manage',
  PAYROLL_MANAGE: 'payroll.manage',

  // Operations
  TRANSPORT_MANAGE: 'transport.manage',
  COMMUNICATIONS_MANAGE: 'communications.manage',
  NOTIFICATIONS_SEND: 'notifications.send',
  REPORTS_VIEW: 'reports.view',
  FILES_MANAGE: 'files.manage',
  AUDIT_VIEW: 'audit.view',

  // Platform Administration
  PLATFORM_ADMIN: 'platform.admin',
} as const;

export type SystemPermission = typeof SystemPermissions[keyof typeof SystemPermissions];
