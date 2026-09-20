import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:Multi-Tenant-SaaS-Portal@localhost:5432/multi_tenant_saas?schema=public';

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- Initializing Database Seeding ---');

  // Authoritative system permissions
  const permissions = [
    // Tenancy & Settings
    { id: 'settings.view', name: 'View Settings', module: 'settings' },
    { id: 'settings.manage', name: 'Manage Settings', module: 'settings' },
    { id: 'domains.manage', name: 'Manage Domains', module: 'domains' },
    { id: 'website.view', name: 'View Website Settings', module: 'website' },
    { id: 'website.manage', name: 'Manage Website CMS', module: 'website' },
    { id: 'content.publish', name: 'Publish Website Content', module: 'website' },
    { id: 'subscription.view', name: 'View Subscription', module: 'subscription' },
    { id: 'subscription.manage', name: 'Manage Subscription', module: 'subscription' },
    { id: 'billing.view', name: 'View Billing', module: 'billing' },
    { id: 'billing.manage', name: 'Manage Billing', module: 'billing' },

    // Users & Roles
    { id: 'users.view', name: 'View Users', module: 'users' },
    { id: 'users.create', name: 'Create Users', module: 'users' },
    { id: 'users.update', name: 'Update Users', module: 'users' },
    { id: 'users.delete', name: 'Delete Users', module: 'users' },
    { id: 'users.manage', name: 'Manage Users', module: 'users' },
    { id: 'roles.manage', name: 'Manage Roles', module: 'roles' },

    // Campuses
    { id: 'campuses.view', name: 'View Campuses', module: 'campuses' },
    { id: 'campuses.manage', name: 'Manage Campuses', module: 'campuses' },

    // Students & Parents
    { id: 'students.view', name: 'View Students', module: 'students' },
    { id: 'students.create', name: 'Create Students', module: 'students' },
    { id: 'students.update', name: 'Update Students', module: 'students' },
    { id: 'students.delete', name: 'Delete Students', module: 'students' },
    { id: 'parents.view', name: 'View Parents', module: 'parents' },
    { id: 'parents.manage', name: 'Manage Parents', module: 'parents' },

    // Teachers & Staff
    { id: 'teachers.view', name: 'View Teachers', module: 'teachers' },
    { id: 'teachers.manage', name: 'Manage Teachers', module: 'teachers' },

    // Academics
    { id: 'academics.view', name: 'View Academics', module: 'academics' },
    { id: 'academics.manage', name: 'Manage Academics', module: 'academics' },

    // Attendance
    { id: 'attendance.view', name: 'View Attendance', module: 'attendance' },
    { id: 'attendance.mark', name: 'Mark Attendance', module: 'attendance' },

    // Examinations & Results
    { id: 'examinations.manage', name: 'Manage Examinations', module: 'examinations' },
    { id: 'results.enter', name: 'Enter Results', module: 'results' },
    { id: 'results.approve', name: 'Approve Results', module: 'results' },
    { id: 'results.publish', name: 'Publish Results', module: 'results' },

    // Fees & Finance
    { id: 'fees.view', name: 'View Fees', module: 'fees' },
    { id: 'fees.create', name: 'Create Fees', module: 'fees' },
    { id: 'fees.manage', name: 'Manage Fees', module: 'fees' },
    { id: 'invoices.manage', name: 'Manage Invoices', module: 'fees' },
    { id: 'payments.view', name: 'View Payments', module: 'payments' },
    { id: 'payments.refund', name: 'Refund Payments', module: 'payments' },
    { id: 'payroll.manage', name: 'Manage Payroll', module: 'payroll' },
    { id: 'expenses.manage', name: 'Manage Expenses', module: 'expenses' },

    // Operations
    { id: 'transport.view', name: 'View Transport', module: 'transport' },
    { id: 'transport.manage', name: 'Manage Transport', module: 'transport' },
    { id: 'reports.view', name: 'View Reports', module: 'reports' },
    { id: 'files.manage', name: 'Manage Files', module: 'files' },
    { id: 'audit.view', name: 'View Audit Logs', module: 'audit' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { id: perm.id },
      update: { name: perm.name, module: perm.module },
      create: { id: perm.id, name: perm.name, module: perm.module },
    });
  }
  console.log(`Synced ${permissions.length} system permissions.`);

  // Demo tenant seeding is STRICTLY opt-in and conditional (never auto-seed on clean DB)
  const shouldSeedDemo = process.env.SEED_DEMO_TENANT === 'true' || process.env.SEED_DEMO === 'true';
  if (shouldSeedDemo) {
    console.log('SEED_DEMO_TENANT is enabled. Seeding isolated Greenfield demo tenant...');

    const demoTenantId = 'tenant_greenfield_100';
    const demoSlug = 'greenfield';

    const demoTenant = await prisma.tenant.upsert({
      where: { id: demoTenantId },
      update: {
        status: 'ACTIVE',
        name: 'Greenfield International Academy',
        slug: demoSlug,
      },
      create: {
        id: demoTenantId,
        name: 'Greenfield International Academy',
        slug: demoSlug,
        logoUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=200',
        faviconUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=32',
        primaryColor: '#0f172a',
        secondaryColor: '#3b82f6',
        timezone: 'UTC',
        locale: 'en',
        currency: 'USD',
        status: 'ACTIVE',
        plan: 'standard',
      },
    });

    await prisma.tenantDomain.upsert({
      where: { domain: 'greenfield.yoursaas.com' },
      update: { isVerified: true, isPrimary: true },

      create: {
        tenantId: demoTenant.id,
        domain: 'greenfield.yoursaas.com',
        type: 'SUBDOMAIN',
        isPrimary: true,
        isVerified: true,
      },
    });

    const campus = await prisma.campus.upsert({
      where: {
        tenantId_code: {
          tenantId: demoTenant.id,
          code: 'CAMPUS-01',
        },
      },
      update: { isMain: true },
      create: {
        id: 'campus_main_01',
        tenantId: demoTenant.id,
        name: 'Main Campus',
        code: 'CAMPUS-01',
        address: '14 Education Boulevard',
        city: 'Lagos',
        state: 'Lagos State',
        country: 'Nigeria',
        phone: '+234 801 234 5678',
        email: 'maincampus@greenfield.edu.ng',
        isMain: true,
      },
    });

    const adminRole = await prisma.role.upsert({
      where: {
        tenantId_name: {
          tenantId: demoTenant.id,
          name: 'ADMIN',
        },
      },
      update: {},
      create: {
        tenantId: demoTenant.id,
        name: 'ADMIN',
        description: 'Greenfield Demo Administrator',
        isSystem: true,
      },
    });

    const existingUser = await prisma.user.findFirst({
      where: { tenantId: demoTenant.id, email: 'admin@greenfield.edu.ng' },
    });
    let adminUser = existingUser;
    if (!adminUser) {
      const passwordHash = await bcrypt.hash('DemoAdmin123!', 10);
      adminUser = await prisma.user.create({
        data: {
          id: 'user_greenfield_admin_001',
          tenantId: demoTenant.id,
          email: 'admin@greenfield.edu.ng',
          passwordHash,
          firstName: 'Greenfield',
          lastName: 'Administrator',
          isActive: true,
        },
      });
      await prisma.userRole.create({
        data: {
          userId: adminUser.id,
          roleId: adminRole.id,
        },
      });
    }

    const yr = new Date().getFullYear();
    let academicYear = await prisma.academicYear.findFirst({
      where: { tenantId: demoTenant.id, isCurrent: true },
    });
    if (!academicYear) {
      academicYear = await prisma.academicYear.create({
        data: {
          id: `ay_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId: demoTenant.id,
          name: `${yr}/${yr + 1}`,
          startDate: new Date(`${yr}-09-01`),
          endDate: new Date(`${yr + 1}-07-31`),
          isCurrent: true,
        },
      });

      await prisma.term.createMany({
        data: [
          {
            id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId: demoTenant.id,
            academicYearId: academicYear.id,
            name: 'First Term',
            startDate: new Date(`${yr}-09-01`),
            endDate: new Date(`${yr}-12-15`),
            isCurrent: true,
          },
          {
            id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId: demoTenant.id,
            academicYearId: academicYear.id,
            name: 'Second Term',
            startDate: new Date(`${yr + 1}-01-10`),
            endDate: new Date(`${yr + 1}-04-05`),
            isCurrent: false,
          },
          {
            id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId: demoTenant.id,
            academicYearId: academicYear.id,
            name: 'Third Term',
            startDate: new Date(`${yr + 1}-04-25`),
            endDate: new Date(`${yr + 1}-07-20`),
            isCurrent: false,
          },
        ],
      });
    }

    const existingClasses = await prisma.class.findMany({ where: { tenantId: demoTenant.id } });
    if (existingClasses.length === 0) {
      const defaultClasses = [
        { name: 'JSS 1', gradeLevel: 'Junior Secondary 1' },
        { name: 'JSS 2', gradeLevel: 'Junior Secondary 2' },
        { name: 'JSS 3', gradeLevel: 'Junior Secondary 3' },
        { name: 'SSS 1', gradeLevel: 'Senior Secondary 1' },
        { name: 'SSS 2', gradeLevel: 'Senior Secondary 2' },
        { name: 'SSS 3', gradeLevel: 'Senior Secondary 3' },
      ];
      for (const cls of defaultClasses) {
        await prisma.class.create({
          data: {
            id: `cls_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId: demoTenant.id,
            campusId: campus.id,
            academicYearId: academicYear.id,
            name: cls.name,
            gradeLevel: cls.gradeLevel,
            capacity: 40,
          },
        });
      }
    }

    await prisma.websiteConfig.upsert({
      where: { tenantId: demoTenant.id },
      update: {
        heroTitle: 'Welcome to Greenfield International Academy',
        isPublished: true,
      },
      create: {
        tenantId: demoTenant.id,
        heroTitle: 'Welcome to Greenfield International Academy',
        heroSubtitle: 'Nurturing Future Leaders with Academic Excellence & Integrity',
        aboutStory: 'Greenfield International Academy is a premier co-educational institution.',
        contactEmail: 'info@greenfield.edu.ng',
        contactPhone: '+234 801 234 5678',
        isPublished: true,
      },
    });

    console.log(`Seeded demo tenant: ${demoTenant.name} (${demoTenant.id}) with campus ${campus.name}.`);
  } else {
    console.log('Skipping demo tenant seeding (set SEED_DEMO_TENANT=true to enable demo data seeding).');
  }

  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Database seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

