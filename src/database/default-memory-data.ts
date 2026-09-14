/**
 * Initial demo data for resilient in-memory fallback mode
 * Used strictly in development/testing when live PostgreSQL is unavailable.
 */
export function populateDefaultMemoryStore(memoryStore: Record<string, Map<string, any>>) {
  const demoTenantId = 'tenant_greenfield_100';
  const demoCampusId = 'campus_main_01';
  const demoAcademicYearId = 'ay_2026_2027';
  const demoTermId = 'term_first_2026';
  const demoClassId = 'cls_grade10_a';
  const demoSubjectId = 'sub_math_101';

  memoryStore.tenants.set(demoTenantId, {
    id: demoTenantId,
    name: 'Greenfield International Academy',
    slug: 'greenfield',
    logoUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=200',
    faviconUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=32',
    primaryColor: '#1e3a8a',
    secondaryColor: '#0ea5e9',
    timezone: 'UTC',
    locale: 'en',
    currency: 'USD',
    status: 'ACTIVE',
    plan: 'pro',
    features: {
      attendance: true,
      examinations: true,
      fees: true,
      payroll: true,
      transport: true,
      onlinePayments: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  memoryStore.domains.set('domain_1', {
    id: 'domain_1',
    tenantId: demoTenantId,
    domain: 'greenfield.yoursaas.com',
    type: 'SUBDOMAIN',
    isPrimary: true,
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  memoryStore.domains.set('domain_2', {
    id: 'domain_2',
    tenantId: demoTenantId,
    domain: 'greenfieldschool.edu.ng',
    type: 'CUSTOM',
    isPrimary: false,
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  memoryStore.campuses.set(demoCampusId, {
    id: demoCampusId,
    tenantId: demoTenantId,
    name: 'Main Campus',
    code: 'CAMPUS-01',
    address: '14 Education Boulevard',
    city: 'Lagos',
    state: 'Lagos State',
    country: 'Nigeria',
    phone: '+234 801 234 5678',
    email: 'maincampus@greenfield.edu.ng',
    isMain: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  memoryStore.academicYears.set(demoAcademicYearId, {
    id: demoAcademicYearId,
    tenantId: demoTenantId,
    name: '2026/2027 Academic Session',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2027-07-20'),
    isCurrent: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  memoryStore.terms.set(demoTermId, {
    id: demoTermId,
    tenantId: demoTenantId,
    academicYearId: demoAcademicYearId,
    name: 'First Term',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-12-18'),
    isCurrent: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  memoryStore.classes.set(demoClassId, {
    id: demoClassId,
    tenantId: demoTenantId,
    campusId: demoCampusId,
    academicYearId: demoAcademicYearId,
    name: 'Grade 10 Gold',
    gradeLevel: 'Grade 10',
    stream: 'Gold',
    capacity: 35,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  memoryStore.subjects.set(demoSubjectId, {
    id: demoSubjectId,
    tenantId: demoTenantId,
    code: 'MATH101',
    name: 'Advanced Mathematics',
    description: 'Algebra, Geometry & Statistics',
    isElective: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Default School Owner User
  const demoOwnerId = 'user_owner_001';
  memoryStore.users.set(demoOwnerId, {
    id: demoOwnerId,
    tenantId: demoTenantId,
    email: 'admin@greenfield.edu.ng',
    passwordHash: '$2a$10$iIuJ0rK9V8g7dD2C9Xv2UuG0wOaG0j6YtM8aM.Z8eJ6K0pY9jA0yW',
    firstName: 'Dr. Arthur',
    lastName: 'Pendelton',
    phone: '+234 809 111 2233',
    isActive: true,
    isPlatformAdmin: false,
    roles: ['School Owner'],
    permissionIds: [
      'settings.view', 'settings.manage', 'domains.manage', 'subscription.manage',
      'users.view', 'users.create', 'users.update', 'users.delete', 'users.manage',
      'campuses.view', 'campuses.manage', 'students.view', 'students.create', 'students.update', 'students.delete',
      'academics.view', 'academics.manage', 'attendance.view', 'attendance.mark',
      'examinations.manage', 'results.enter', 'results.approve', 'results.publish',
      'fees.view', 'fees.create', 'fees.manage', 'invoices.manage', 'payments.view', 'payments.refund',
      'payroll.manage', 'expenses.manage', 'transport.manage', 'reports.view', 'files.manage', 'audit.view'
    ],
    campusIds: [demoCampusId],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Default Student
  const demoStudentId = 'std_john_doe_01';
  memoryStore.students.set(demoStudentId, {
    id: demoStudentId,
    tenantId: demoTenantId,
    campusId: demoCampusId,
    admissionNumber: 'GFA/2026/001',
    firstName: 'John',
    middleName: 'Emeka',
    lastName: 'Doe',
    gender: 'Male',
    dateOfBirth: new Date('2010-05-14'),
    bloodGroup: 'O+',
    email: 'john.doe@student.greenfield.edu.ng',
    phone: '+234 803 000 1111',
    address: '7 Victoria Island Crescent, Lagos',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Default Fee Structure & Invoice
  const demoFeeId = 'fee_tuition_g10_first_term';
  memoryStore.feeStructures.set(demoFeeId, {
    id: demoFeeId,
    tenantId: demoTenantId,
    campusId: demoCampusId,
    academicYearId: demoAcademicYearId,
    termId: demoTermId,
    name: 'First Term Tuition & Facility Fee',
    amount: 1500,
    currency: 'USD',
    dueDate: new Date('2026-10-15'),
    applicableGradeLevel: 'Grade 10',
    createdAt: new Date(),
  });

  const demoInvoiceId = 'inv_2026_001';
  memoryStore.invoices.set(demoInvoiceId, {
    id: demoInvoiceId,
    tenantId: demoTenantId,
    studentId: demoStudentId,
    feeStructureId: demoFeeId,
    invoiceNumber: 'INV-2026-0001',
    totalAmount: 1500,
    paidAmount: 500,
    balanceAmount: 1000,
    dueDate: new Date('2026-10-15'),
    status: 'PARTIALLY_PAID',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
