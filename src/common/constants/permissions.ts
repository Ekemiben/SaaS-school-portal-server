export const SystemPermissions = {
  // Tenancy & Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',
  DOMAINS_MANAGE: 'domains.manage',
  SUBSCRIPTION_VIEW: 'subscription.view',
  SUBSCRIPTION_MANAGE: 'subscription.manage',
  BILLING_VIEW: 'billing.view',
  BILLING_MANAGE: 'billing.manage',

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
  TRANSPORT_VIEW: 'transport.view',
  TRANSPORT_MANAGE: 'transport.manage',
  TRANSPORT_TRACK: 'transport.track',
  COMMUNICATIONS_VIEW: 'communications.view',
  COMMUNICATIONS_MANAGE: 'communications.manage',
  NOTIFICATIONS_SEND: 'notifications.send',
  REPORTS_VIEW: 'reports.view',
  FILES_MANAGE: 'files.manage',
  AUDIT_VIEW: 'audit.view',

  // Health, Medical & Clinic
  MEDICAL_VIEW: 'medical.view',
  MEDICAL_MANAGE: 'medical.manage',

  // Discipline, Behavior & Pastoral Care
  DISCIPLINE_VIEW: 'discipline.view',
  DISCIPLINE_MANAGE: 'discipline.manage',

  // Hostel & Dormitory Management
  HOSTEL_VIEW: 'hostel.view',
  HOSTEL_MANAGE: 'hostel.manage',

  // Library Management System
  LIBRARY_VIEW: 'library.view',
  LIBRARY_MANAGE: 'library.manage',

  // Inventory, Assets & Procurement
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_MANAGE: 'inventory.manage',
  ASSETS_VIEW: 'assets.view',
  ASSETS_MANAGE: 'assets.manage',
  PROCUREMENT_VIEW: 'procurement.view',
  PROCUREMENT_MANAGE: 'procurement.manage',

  // Data Exchange & Backups
  DATA_IMPORT: 'data.import',
  DATA_EXPORT: 'data.export',
  DATA_BACKUP: 'data.backup',

  // Platform Administration
  PLATFORM_ADMIN: 'platform.admin',
  IMPERSONATE_USER: 'impersonate.user',
} as const;

export type SystemPermission = typeof SystemPermissions[keyof typeof SystemPermissions];
