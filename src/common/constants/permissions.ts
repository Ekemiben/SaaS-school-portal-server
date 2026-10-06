export const SystemPermissions = {
  // Tenancy & Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',
  DOMAINS_MANAGE: 'domains.manage',
  WEBSITE_VIEW: 'website.view',
  WEBSITE_MANAGE: 'website.manage',
  CONTENT_PUBLISH: 'content.publish',
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
  STAFF_ATTENDANCE_VIEW: 'staff_attendance.view',
  STAFF_ATTENDANCE_CLOCK: 'staff_attendance.clock',
  STAFF_ATTENDANCE_MANAGE: 'staff_attendance.manage',
  STAFF_ATTENDANCE_EXPORT: 'staff_attendance.export',

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

  // Platform Administration (Granular)
  PLATFORM_ADMIN: 'platform.admin',
  IMPERSONATE_USER: 'impersonate.user',
  PLATFORM_TENANT_VIEW: 'platform.tenant.view',
  PLATFORM_TENANT_CREATE: 'platform.tenant.create',
  PLATFORM_TENANT_UPDATE: 'platform.tenant.update',
  PLATFORM_TENANT_SUSPEND: 'platform.tenant.suspend',
  PLATFORM_TENANT_DELETE: 'platform.tenant.delete',
  PLATFORM_USER_VIEW: 'platform.user.view',
  PLATFORM_USER_CREATE: 'platform.user.create',
  PLATFORM_USER_UPDATE: 'platform.user.update',
  PLATFORM_USER_DEACTIVATE: 'platform.user.deactivate',
  PLATFORM_ROLE_VIEW: 'platform.role.view',
  PLATFORM_ROLE_ASSIGN: 'platform.role.assign',
  PLATFORM_PERMISSION_ASSIGN: 'platform.permission.assign',
  PLATFORM_AUDIT_VIEW: 'platform.audit.view',
  PLATFORM_IMPERSONATION_START: 'platform.impersonation.start',
  PLATFORM_SETTINGS_VIEW: 'platform.settings.view',
  PLATFORM_SETTINGS_UPDATE: 'platform.settings.update',
} as const;

export type SystemPermission = typeof SystemPermissions[keyof typeof SystemPermissions];

export const PlatformRoles = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  PLATFORM_SUPPORT: 'PLATFORM_SUPPORT',
} as const;

export type PlatformRole = typeof PlatformRoles[keyof typeof PlatformRoles];

export const ScopeTypes = {
  PLATFORM: 'PLATFORM',
  TENANT: 'TENANT',
} as const;

export type ScopeType = typeof ScopeTypes[keyof typeof ScopeTypes];

export const STANDARD_SCHOOL_ROLES = [
  {
    name: 'School Owner',
    code: 'SCHOOL_OWNER',
    description: 'Proprietor and executive governance with comprehensive institutional authority.',
    level: 1,
    permissions: [
      'settings.view', 'settings.manage', 'domains.manage', 'website.view', 'website.manage', 'content.publish',
      'subscription.view', 'subscription.manage', 'billing.view', 'billing.manage',
      'users.view', 'users.create', 'users.update', 'users.delete', 'users.manage', 'roles.manage',
      'campuses.view', 'campuses.manage',
      'students.view', 'students.create', 'students.update', 'students.delete',
      'parents.view', 'parents.manage',
      'teachers.view', 'teachers.manage',
      'academics.view', 'academics.manage',
      'attendance.view', 'attendance.mark', 'staff_attendance.view', 'staff_attendance.clock', 'staff_attendance.manage', 'staff_attendance.export',
      'examinations.manage', 'results.enter', 'results.approve', 'results.publish',
      'fees.view', 'fees.create', 'fees.manage', 'invoices.manage', 'payments.view', 'payments.refund', 'expenses.manage', 'payroll.manage',
      'transport.view', 'transport.manage', 'transport.track', 'communications.view', 'communications.manage', 'notifications.send',
      'reports.view', 'files.manage', 'audit.view',
      'medical.view', 'medical.manage',
      'discipline.view', 'discipline.manage',
      'hostel.view', 'hostel.manage',
      'library.view', 'library.manage',
      'inventory.view', 'inventory.manage', 'assets.view', 'assets.manage', 'procurement.view', 'procurement.manage',
      'data.import', 'data.export', 'data.backup',
    ],
  },
  {
    name: 'Principal',
    code: 'PRINCIPAL',
    description: 'Executive academic and administrative head managing campus daily operations, academics, and staff.',
    level: 2,
    permissions: [
      'settings.view', 'campuses.view',
      'users.view', 'roles.manage',
      'students.view', 'students.create', 'students.update',
      'parents.view', 'parents.manage',
      'teachers.view', 'teachers.manage',
      'academics.view', 'academics.manage',
      'attendance.view', 'attendance.mark', 'staff_attendance.view', 'staff_attendance.manage', 'staff_attendance.export',
      'examinations.manage', 'results.enter', 'results.approve', 'results.publish',
      'fees.view', 'payments.view', 'expenses.manage',
      'transport.view', 'transport.manage', 'transport.track',
      'communications.view', 'communications.manage', 'notifications.send',
      'reports.view', 'files.manage', 'audit.view',
      'medical.view', 'medical.manage',
      'discipline.view', 'discipline.manage',
      'hostel.view', 'hostel.manage',
      'library.view', 'library.manage',
      'inventory.view', 'assets.view',
      'data.export',
    ],
  },
  {
    name: 'Vice Principal',
    code: 'VICE_PRINCIPAL',
    description: 'Academic dean and operations supervisor overseeing class schedules, curriculum delivery, and student discipline.',
    level: 3,
    permissions: [
      'campuses.view',
      'students.view', 'students.create', 'students.update',
      'parents.view',
      'teachers.view',
      'academics.view', 'academics.manage',
      'attendance.view', 'attendance.mark', 'staff_attendance.view',
      'examinations.manage', 'results.enter', 'results.approve',
      'transport.view', 'communications.view', 'notifications.send',
      'reports.view', 'files.manage',
      'medical.view',
      'discipline.view', 'discipline.manage',
      'hostel.view',
      'library.view',
    ],
  },
  {
    name: 'Head of Department (HOD)',
    code: 'HOD',
    description: 'Subject group lead managing departmental curriculum, lesson plan verification, and teacher assessments.',
    level: 4,
    permissions: [
      'teachers.view',
      'academics.view', 'academics.manage',
      'students.view',
      'attendance.view',
      'examinations.manage', 'results.enter', 'results.approve',
      'communications.view', 'reports.view', 'files.manage',
    ],
  },
  {
    name: 'Form Teacher',
    code: 'FORM_TEACHER',
    description: 'Class arm supervisor managing daily student attendance, conduct remarks, and parent communications.',
    level: 5,
    permissions: [
      'students.view', 'students.update',
      'parents.view',
      'academics.view',
      'attendance.view', 'attendance.mark',
      'results.enter',
      'communications.view', 'notifications.send',
      'reports.view', 'medical.view', 'discipline.view',
    ],
  },
  {
    name: 'Subject Teacher',
    code: 'TEACHER',
    description: 'Academic educator managing course delivery, assessment marks entry, homework, and student grading.',
    level: 6,
    permissions: [
      'students.view',
      'academics.view',
      'staff_attendance.clock',
      'results.enter',
      'communications.view',
      'files.manage',
    ],
  },
  {
    name: 'Bursar / Accountant',
    code: 'BURSAR',
    description: 'Financial controller managing tuition billing, fee collection, expenses, and staff payroll schedules.',
    level: 7,
    permissions: [
      'students.view', 'parents.view',
      'fees.view', 'fees.create', 'fees.manage', 'invoices.manage', 'payments.view', 'payments.refund',
      'expenses.manage', 'payroll.manage',
      'reports.view', 'audit.view', 'communications.view', 'notifications.send',
    ],
  },
  {
    name: 'School Administrator',
    code: 'SCHOOL_ADMIN',
    description: 'Front-desk registrar managing student onboarding, guardian records, master structures, and communications.',
    level: 8,
    permissions: [
      'settings.view', 'campuses.view',
      'users.view', 'users.create', 'users.update', 'roles.manage',
      'students.view', 'students.create', 'students.update', 'students.delete',
      'parents.view', 'parents.manage',
      'teachers.view', 'teachers.manage',
      'academics.view', 'academics.manage',
      'attendance.view', 'staff_attendance.view', 'staff_attendance.manage',
      'fees.view', 'payments.view',
      'transport.view', 'transport.manage',
      'communications.view', 'communications.manage', 'notifications.send',
      'reports.view', 'files.manage',
      'medical.view', 'discipline.view', 'hostel.view', 'library.view', 'inventory.view',
    ],
  },
  {
    name: 'School Nurse',
    code: 'SCHOOL_NURSE',
    description: 'Health officer managing clinic logs, student medical records, allergies, and emergency health alerts.',
    level: 9,
    permissions: [
      'students.view', 'parents.view',
      'medical.view', 'medical.manage',
      'communications.view',
    ],
  },
  {
    name: 'Librarian',
    code: 'LIBRARIAN',
    description: 'Resource manager managing book catalogues, borrowing schedules, and digital library inventory.',
    level: 9,
    permissions: [
      'students.view', 'teachers.view',
      'library.view', 'library.manage',
      'inventory.view',
    ],
  },
  {
    name: 'Hostel Master / Matron',
    code: 'HOSTEL_WARDEN',
    description: 'Dormitory warden managing hostel room allocations, night roll-calls, and residential student welfare.',
    level: 9,
    permissions: [
      'students.view', 'parents.view',
      'hostel.view', 'hostel.manage',
      'discipline.view', 'discipline.manage',
      'communications.view',
    ],
  },
  {
    name: 'Transport Officer',
    code: 'TRANSPORT_OFFICER',
    description: 'Logistics coordinator managing bus routes, vehicle maintenance, and student transit manifests.',
    level: 9,
    permissions: [
      'students.view', 'parents.view',
      'transport.view', 'transport.manage', 'transport.track',
      'communications.view',
    ],
  },
  {
    name: 'Parent / Guardian',
    code: 'PARENT',
    description: 'Parent portal access to monitor children attendance, term results, fee invoices, and teacher notices.',
    level: 10,
    permissions: [
      'students.view',
      'attendance.view',
      'fees.view', 'payments.view',
      'communications.view',
    ],
  },
  {
    name: 'Student',
    code: 'STUDENT',
    description: 'Self-service student portal access for timetables, assignments, and published term report cards.',
    level: 10,
    permissions: [
      'attendance.view',
      'communications.view',
    ],
  },
];
