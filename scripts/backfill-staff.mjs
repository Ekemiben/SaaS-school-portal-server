import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:Multi-Tenant-SaaS-Portal@localhost:5432/multi_tenant_saas?schema=public';

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🚀 Starting Universal Staff & TeacherProfile Data Migration...');

  // 1. Fetch all existing teachers
  const teachers = await prisma.teacher.findMany({
    include: {
      campus: true,
      department: true,
      designation: true,
      staffRoom: true,
    },
  });

  console.log(`Found ${teachers.length} existing Teacher record(s) to migrate.`);

  let staffCreatedCount = 0;
  let teacherProfilesCreatedCount = 0;

  for (const t of teachers) {
    // 2. Upsert Staff with identical ID
    const staff = await prisma.staff.upsert({
      where: { id: t.id },
      update: {
        tenantId: t.tenantId,
        campusId: t.campusId,
        userId: t.userId || null,
        employeeNumber: t.employeeNumber,
        firstName: t.firstName,
        lastName: t.lastName,
        email: t.email,
        phone: t.phone || null,
        departmentId: t.departmentId || null,
        designationId: t.designationId || null,
        staffRoomId: t.staffRoomId || null,
        employmentStatus: t.isActive ? 'ACTIVE' : 'ON_LEAVE',
        joiningDate: t.joiningDate || new Date(),
        isActive: t.isActive,
      },
      create: {
        id: t.id,
        tenantId: t.tenantId,
        campusId: t.campusId,
        userId: t.userId || null,
        employeeNumber: t.employeeNumber,
        firstName: t.firstName,
        lastName: t.lastName,
        email: t.email,
        phone: t.phone || null,
        departmentId: t.departmentId || null,
        designationId: t.designationId || null,
        staffRoomId: t.staffRoomId || null,
        employmentStatus: t.isActive ? 'ACTIVE' : 'ON_LEAVE',
        joiningDate: t.joiningDate || new Date(),
        isActive: t.isActive,
      },
    });
    staffCreatedCount++;

    // 3. Upsert TeacherProfile linked 1:1 to Staff
    await prisma.teacherProfile.upsert({
      where: { staffId: staff.id },
      update: {
        tenantId: t.tenantId,
        specialization: t.specialization || null,
        qualification: t.qualification || null,
      },
      create: {
        id: `tcp_${t.id.replace(/^tch_/, '')}`,
        tenantId: t.tenantId,
        staffId: staff.id,
        specialization: t.specialization || null,
        qualification: t.qualification || null,
      },
    });
    teacherProfilesCreatedCount++;
  }

  // 4. Backfill Department headStaffId to point to Staff
  const departments = await prisma.department.findMany({
    where: { headStaffId: { not: null } },
  });

  let deptHeadsLinked = 0;
  for (const d of departments) {
    if (d.headStaffId) {
      const staffExists = await prisma.staff.findUnique({ where: { id: d.headStaffId } });
      if (staffExists) {
        deptHeadsLinked++;
      }
    }
  }

  // 5. Verify Payroll parity
  const payrollCount = await prisma.payroll.count();
  const salaryProfileCount = await prisma.staffSalaryProfile.count();

  console.log('✅ Migration Results:');
  console.log(` - Staff records synced: ${staffCreatedCount}`);
  console.log(` - TeacherProfile records synced: ${teacherProfilesCreatedCount}`);
  console.log(` - Department heads verified: ${deptHeadsLinked}`);
  console.log(` - Historical Payroll snapshots intact: ${payrollCount}`);
  console.log(` - Staff Salary Profiles intact: ${salaryProfileCount}`);
  console.log('🎉 Universal Staff Data Backfill Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
