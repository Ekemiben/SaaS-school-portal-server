const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Multi-Tenant-SaaS-Portal@localhost:5432/multi_tenant_saas?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log('=== ALL TENANTS IN DB ===');
  tenants.forEach(t => console.log(`ID: ${t.id} | Name: ${t.name} | Slug: ${t.slug}`));

  const queens = tenants.find(t => t.name.toLowerCase().includes('queen') || t.slug.toLowerCase().includes('queen'));
  if (!queens) {
    console.log('\n❌ No tenant matching "queen" found in PostgreSQL!');
    return;
  }
  const tId = queens.id;
  console.log(`\n=== FOUND QUEENS TENANT: ${queens.name} (ID: ${tId}, Slug: ${queens.slug}) ===`);
  const campuses = await prisma.campus.findMany({ where: { tenantId: tId } });
  const years = await prisma.academicYear.findMany({ where: { tenantId: tId }, include: { terms: true } });
  const classes = await prisma.class.findMany({ where: { tenantId: tId }, include: { campus: true } });
  const subjects = await prisma.subject.findMany({ where: { tenantId: tId } });
  const students = await prisma.student.findMany({ where: { tenantId: tId }, include: { enrollments: true, campus: true } });
  const staff = await prisma.staff.findMany({ where: { tenantId: tId } });
  const exams = await prisma.examination.findMany({ where: { tenantId: tId }, include: { schedules: true } });
  const results = await prisma.result.findMany({ where: { tenantId: tId } });
  const timetables = await prisma.timetable.findMany({ where: { tenantId: tId }, include: { entries: true } });
  const attendance = await prisma.attendance.findMany({ where: { tenantId: tId } });

  console.log('\n--- CAMPUSES (' + campuses.length + ') ---', campuses);
  console.log('\n--- ACADEMIC YEARS (' + years.length + ') ---', JSON.stringify(years, null, 2));
  console.log('\n--- CLASSES (' + classes.length + ') ---', JSON.stringify(classes, null, 2));
  console.log('\n--- SUBJECTS (' + subjects.length + ') ---', JSON.stringify(subjects, null, 2));
  console.log('\n--- STUDENTS (' + students.length + ') ---', JSON.stringify(students.map(s => ({
    id: s.id,
    name: s.firstName + ' ' + s.lastName,
    admissionNumber: s.admissionNumber,
    campusId: s.campusId,
    status: s.status,
    enrollments: s.enrollments
  })), null, 2));
  console.log('\n--- STAFF (' + staff.length + ') ---', JSON.stringify(staff, null, 2));
  console.log('\n--- EXAMINATIONS (' + exams.length + ') ---', JSON.stringify(exams, null, 2));
  console.log('\n--- RESULTS (' + results.length + ') ---', JSON.stringify(results, null, 2));
  console.log('\n--- TIMETABLES (' + timetables.length + ') ---', JSON.stringify(timetables, null, 2));
  console.log('\n--- ATTENDANCE (' + attendance.length + ') ---', JSON.stringify(attendance, null, 2));
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
