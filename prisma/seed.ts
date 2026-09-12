import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/school_saas?schema=public';

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding production database...');

  // System permissions
  const permissions = [
    { id: 'settings.view', name: 'View Settings', module: 'settings' },
    { id: 'settings.manage', name: 'Manage Settings', module: 'settings' },
    { id: 'domains.manage', name: 'Manage Domains', module: 'domains' },
    { id: 'subscription.manage', name: 'Manage Subscription', module: 'subscription' },
    { id: 'users.view', name: 'View Users', module: 'users' },
    { id: 'users.create', name: 'Create Users', module: 'users' },
    { id: 'users.update', name: 'Update Users', module: 'users' },
    { id: 'users.delete', name: 'Delete Users', module: 'users' },
    { id: 'users.manage', name: 'Manage Users', module: 'users' },
    { id: 'campuses.view', name: 'View Campuses', module: 'campuses' },
    { id: 'campuses.manage', name: 'Manage Campuses', module: 'campuses' },
    { id: 'students.view', name: 'View Students', module: 'students' },
    { id: 'students.create', name: 'Create Students', module: 'students' },
    { id: 'students.update', name: 'Update Students', module: 'students' },
    { id: 'students.delete', name: 'Delete Students', module: 'students' },
    { id: 'academics.view', name: 'View Academics', module: 'academics' },
    { id: 'academics.manage', name: 'Manage Academics', module: 'academics' },
    { id: 'attendance.view', name: 'View Attendance', module: 'attendance' },
    { id: 'attendance.mark', name: 'Mark Attendance', module: 'attendance' },
    { id: 'examinations.manage', name: 'Manage Examinations', module: 'examinations' },
    { id: 'results.enter', name: 'Enter Results', module: 'results' },
    { id: 'results.approve', name: 'Approve Results', module: 'results' },
    { id: 'results.publish', name: 'Publish Results', module: 'results' },
    { id: 'fees.view', name: 'View Fees', module: 'fees' },
    { id: 'fees.create', name: 'Create Fees', module: 'fees' },
    { id: 'fees.manage', name: 'Manage Fees', module: 'fees' },
    { id: 'invoices.manage', name: 'Manage Invoices', module: 'fees' },
    { id: 'payments.view', name: 'View Payments', module: 'payments' },
    { id: 'payments.refund', name: 'Refund Payments', module: 'payments' },
    { id: 'payroll.manage', name: 'Manage Payroll', module: 'payroll' },
    { id: 'expenses.manage', name: 'Manage Expenses', module: 'expenses' },
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

  // Default demo school if requested or if database has no tenants
  const tenantCount = await prisma.tenant.count();
  if (tenantCount === 0 || process.env.SEED_DEMO_TENANT === 'true') {
    const demoTenant = await prisma.tenant.upsert({
      where: { slug: 'greenfield' },
      update: {},
      create: {
        id: 'tenant_greenfield_100',
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
      },
    });

    await prisma.tenantDomain.upsert({
      where: {
        tenantId_domain: {
          tenantId: demoTenant.id,
          domain: 'greenfield.yoursaas.com',
        },
      },
      update: {},
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
      update: {},
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

    console.log(`Seeded demo tenant: ${demoTenant.name} (${demoTenant.slug}) with campus ${campus.name}.`);
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
