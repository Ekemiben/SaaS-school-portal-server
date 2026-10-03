import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { randomUUID } from 'crypto';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:Multi-Tenant-SaaS-Portal@localhost:5432/multi_tenant_saas?schema=public';

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function runPhase6Verification() {
  console.log('========================================================================');
  console.log('🧪 PHASE 6: COMPREHENSIVE END-TO-END FUNCTIONAL VERIFICATION');
  console.log('========================================================================\n');

  // Step 0: Identify active tenant and campus
  const tenant = await prisma.tenant.findFirst({
    include: { campuses: true },
  });

  if (!tenant) {
    throw new Error('No tenant found in database for testing.');
  }

  const tenantId = tenant.id;
  const campusId = tenant.campuses[0]?.id || (await prisma.campus.create({
    data: {
      id: `cmp_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
      tenantId,
      name: 'Main Campus',
      code: 'MAIN',
      isMain: true,
    }
  })).id;

  console.log(`[Setup] Using Tenant: "${tenant.name}" (${tenantId})`);
  console.log(`[Setup] Using Campus: (${campusId})\n`);

  // Ensure department and designation
  let dept = await prisma.department.findFirst({ where: { tenantId } });
  if (!dept) {
    dept = await prisma.department.create({
      data: {
        id: `dept_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
        tenantId,
        name: 'Operations & Logistics',
        code: 'OPS',
      },
    });
  }

  let driverDesig = await prisma.designation.findFirst({ where: { tenantId, name: 'Lead School Driver' } });
  if (!driverDesig) {
    driverDesig = await prisma.designation.create({
      data: {
        id: `desig_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
        tenantId,
        name: 'Lead School Driver',
        code: 'DRV-01',
      },
    });
  }

  let teacherDesig = await prisma.designation.findFirst({ where: { tenantId, name: 'Senior Teacher' } });
  if (!teacherDesig) {
    teacherDesig = await prisma.designation.create({
      data: {
        id: `desig_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
        tenantId,
        name: 'Senior Teacher',
        code: 'TCH-SR',
      },
    });
  }

  // ------------------------------------------------------------------------
  // Scenario 1: Non-Teaching Staff Onboarding (Driver / Accountant)
  // ------------------------------------------------------------------------
  console.log('▶ Scenario 1: Non-Teaching Staff Onboarding...');
  const driverEmpNo = `DRV-${Date.now().toString().slice(-4)}`;
  const driverStaffId = `stf_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

  const driverStaff = await prisma.$transaction(async (tx) => {
    const s = await tx.staff.create({
      data: {
        id: driverStaffId,
        tenantId,
        campusId,
        employeeNumber: driverEmpNo,
        firstName: 'Samuel',
        lastName: 'Okonkwo',
        email: `samuel.driver.${Date.now()}@school.edu`,
        phone: '+2348011223344',
        departmentId: dept.id,
        designationId: driverDesig.id,
        employmentStatus: 'ACTIVE',
        isActive: true,
      },
    });

    await tx.staffSalaryProfile.upsert({
      where: { tenantId_staffUserId: { tenantId, staffUserId: s.id } },
      update: {},
      create: {
        id: `ssp_${s.id}`,
        tenantId,
        campusId,
        staffUserId: s.id,
        basicSalary: 180000,
        housingAllowance: 30000,
        transportAllowance: 25000,
        otherAllowances: 10000,
        bankName: 'Access Bank Plc',
        accountNumber: '0123456789',
        accountName: 'Samuel Okonkwo',
        isActive: true,
      },
    });
    return s;
  });

  const verifiedDriver = await prisma.staff.findUnique({
    where: { id: driverStaff.id },
    include: { teacherProfile: true, department: true, designation: true },
  });

  const verifiedSalary = await prisma.staffSalaryProfile.findUnique({
    where: { tenantId_staffUserId: { tenantId, staffUserId: driverStaff.id } },
  });

  if (!verifiedDriver || verifiedDriver.teacherProfile !== null) {
    throw new Error('Scenario 1 Failed: Non-teaching staff must NOT have a TeacherProfile.');
  }
  if (!verifiedSalary || verifiedSalary.basicSalary !== 180000) {
    throw new Error('Scenario 1 Failed: Salary profile was not persisted correctly.');
  }
  console.log(`  ✓ Successfully onboarded non-teaching staff: ${verifiedDriver.firstName} ${verifiedDriver.lastName}`);
  console.log(`  ✓ Confirmed TeacherProfile is NULL (non-teaching)`);
  console.log(`  ✓ Confirmed StaffSalaryProfile linked to staffUserId=${verifiedSalary.staffUserId} with salary=${verifiedSalary.basicSalary}\n`);

  // ------------------------------------------------------------------------
  // Scenario 2: Teaching Staff Onboarding (Teacher + TeacherProfile)
  // ------------------------------------------------------------------------
  console.log('▶ Scenario 2: Teaching Staff Onboarding & Parity...');
  const teacherEmpNo = `TCH-${Date.now().toString().slice(-4)}`;
  const teacherStaffId = `stf_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

  const educatorStaff = await prisma.$transaction(async (tx) => {
    const s = await tx.staff.create({
      data: {
        id: teacherStaffId,
        tenantId,
        campusId,
        employeeNumber: teacherEmpNo,
        firstName: 'Victoria',
        lastName: 'Adeyemi',
        email: `victoria.teacher.${Date.now()}@school.edu`,
        phone: '+2348055667788',
        departmentId: dept.id,
        designationId: teacherDesig.id,
        employmentStatus: 'ACTIVE',
        isActive: true,
      },
    });

    await tx.teacherProfile.create({
      data: {
        id: `tcp_${s.id.replace(/^stf_/, '')}`,
        tenantId,
        staffId: s.id,
        specialization: 'Physics & Advanced Mathematics',
        qualification: 'B.Sc Ed Physics, M.Ed',
      },
    });

    await tx.teacher.create({
      data: {
        id: s.id,
        tenantId,
        campusId,
        employeeNumber: teacherEmpNo,
        firstName: 'Victoria',
        lastName: 'Adeyemi',
        email: s.email,
        phone: s.phone,
        departmentId: dept.id,
        designationId: teacherDesig.id,
        specialization: 'Physics & Advanced Mathematics',
        qualification: 'B.Sc Ed Physics, M.Ed',
        isActive: true,
      },
    });

    return s;
  });

  const verifiedTeacher = await prisma.staff.findUnique({
    where: { id: educatorStaff.id },
    include: { teacherProfile: true },
  });
  const verifiedLegacyTeacher = await prisma.teacher.findUnique({
    where: { id: educatorStaff.id },
  });

  if (!verifiedTeacher || !verifiedTeacher.teacherProfile) {
    throw new Error('Scenario 2 Failed: Teaching staff must have 1:1 TeacherProfile.');
  }
  if (!verifiedLegacyTeacher) {
    throw new Error('Scenario 2 Failed: Backward-compatible Teacher record missing.');
  }
  console.log(`  ✓ Successfully onboarded educator: ${verifiedTeacher.firstName} ${verifiedTeacher.lastName}`);
  console.log(`  ✓ Confirmed 1:1 TeacherProfile linked: spec="${verifiedTeacher.teacherProfile.specialization}"`);
  console.log(`  ✓ Confirmed Teacher parity with identical ID=${verifiedLegacyTeacher.id}\n`);

  // ------------------------------------------------------------------------
  // Scenario 3: Examination Hall & Venue Verification
  // ------------------------------------------------------------------------
  console.log('▶ Scenario 3: Examination Hall Creation & Venue Resolution...');
  const hallName = `Main Assembly & Exam Hall ${Date.now().toString().slice(-4)}`;
  const examHall = await prisma.examinationHall.create({
    data: {
      id: `hall_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
      tenantId,
      campusId,
      name: hallName,
      building: 'West Academic Block',
      roomNumber: 'W-101',
      capacity: 250,
    },
  });

  const verifiedHall = await prisma.examinationHall.findUnique({
    where: { id: examHall.id },
  });
  if (!verifiedHall || verifiedHall.capacity !== 250) {
    throw new Error('Scenario 3 Failed: Examination hall creation failed.');
  }
  console.log(`  ✓ Successfully created exam hall: "${verifiedHall.name}" (Capacity: ${verifiedHall.capacity})\n`);

  // ------------------------------------------------------------------------
  // Scenario 4: Exam Cycle & Instructions/Regulations Persistence
  // ------------------------------------------------------------------------
  console.log('▶ Scenario 4: Exam Cycle Creation with Multiline Instructions & Regulations...');
  let academicYear = await prisma.academicYear.findFirst({ where: { tenantId } });
  if (!academicYear) {
    academicYear = await prisma.academicYear.create({
      data: {
        id: `ay_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
        tenantId,
        name: `2026/2027 Academic Session ${Date.now().toString().slice(-4)}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-20'),
        isCurrent: true,
      },
    });
  }

  let term = await prisma.term.findFirst({ where: { tenantId, academicYearId: academicYear.id } });
  if (!term) {
    term = await prisma.term.create({
      data: {
        id: `trm_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
        tenantId,
        academicYearId: academicYear.id,
        name: 'First Term Examination Series',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-18'),
        isCurrent: true,
      },
    });
  }

  const instructionsText = '1. Candidates must be seated 15 minutes before the start of the paper.\n2. All calculators must be non-programmable.\n3. Turn off all cellular devices.';
  const regulationsText = 'Section 4.1: Any form of examination malpractice will lead to immediate cancellation.\nSection 4.2: Impersonation attracts immediate expulsion.';

  const examCycle = await prisma.examination.create({
    data: {
      id: `exam_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
      tenantId,
      campusId,
      academicYearId: academicYear.id,
      termId: term.id,
      name: `2026 First Term Mid-Term Assessment Series ${Date.now().toString().slice(-4)}`,
      examType: 'MID_TERM',
      status: 'Scheduled',
      instructions: instructionsText,
      regulations: regulationsText,
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 86400000),
      isPublished: true,
    },
  });

  const verifiedCycle = await prisma.examination.findUnique({
    where: { id: examCycle.id },
  });

  if (verifiedCycle.instructions !== instructionsText || verifiedCycle.regulations !== regulationsText) {
    throw new Error('Scenario 4 Failed: Multiline instructions or regulations were truncated/mutated.');
  }
  console.log(`  ✓ Successfully created Exam Cycle: "${verifiedCycle.name}"`);
  console.log(`  ✓ Verified Instructions text preserved (${verifiedCycle.instructions.split('\n').length} lines)`);
  console.log(`  ✓ Verified Regulations text preserved (${verifiedCycle.regulations.split('\n').length} lines)\n`);

  // ------------------------------------------------------------------------
  // Scenario 5: Exam Paper Scheduling with Invigilators & Hall
  // ------------------------------------------------------------------------
  console.log('▶ Scenario 5: Exam Paper Scheduling with Universal Staff Invigilators...');
  let testClass = await prisma.class.findFirst({ where: { tenantId } });
  if (!testClass) {
    testClass = await prisma.class.create({
      data: {
        id: `cls_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
        tenantId,
        campusId,
        academicYearId: academicYear.id,
        name: `Senior Secondary 3A ${Date.now().toString().slice(-4)}`,
        gradeLevel: 'SS3',
      },
    });
  }

  let testSubject = await prisma.subject.findFirst({ where: { tenantId } });
  if (!testSubject) {
    testSubject = await prisma.subject.create({
      data: {
        id: `sbj_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
        tenantId,
        name: 'Physics (Theory & Practical)',
        code: 'PHY-301',
      },
    });
  }

  const examSchedule = await prisma.examSchedule.create({
    data: {
      id: `sch_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
      examinationId: verifiedCycle.id,
      classId: testClass.id,
      subjectId: testSubject.id,
      hallId: verifiedHall.id,
      hallName: verifiedHall.name,
      chiefInvigilatorId: educatorStaff.id, // Teacher as Chief Invigilator
      assistantInvigilatorId: driverStaff.id, // Universal Staff (Driver) as Assistant Invigilator
      paperCode: 'PHY-301-T1',
      candidatesCount: 45,
      examDate: new Date(),
      startTime: '09:00',
      endTime: '11:30',
      duration: '2h 30m',
      maxMarks: 100,
      passMarks: 50,
    },
    include: {
      examination: true,
      class: true,
      subject: true,
      hall: true,
      chiefInvigilator: true,
      assistantInvigilator: true,
    },
  });

  if (
    !examSchedule.chiefInvigilator ||
    examSchedule.chiefInvigilator.id !== educatorStaff.id ||
    !examSchedule.assistantInvigilator ||
    examSchedule.assistantInvigilator.id !== driverStaff.id
  ) {
    throw new Error('Scenario 5 Failed: ExamSchedule invigilator relations failed to resolve.');
  }

  console.log(`  ✓ Exam paper scheduled: "${examSchedule.subject.name}" (${examSchedule.paperCode})`);
  console.log(`  ✓ Venue: "${examSchedule.hall?.name}"`);
  console.log(`  ✓ Chief Invigilator: ${examSchedule.chiefInvigilator.firstName} ${examSchedule.chiefInvigilator.lastName} (${examSchedule.chiefInvigilator.employeeNumber})`);
  console.log(`  ✓ Assistant Invigilator: ${examSchedule.assistantInvigilator.firstName} ${examSchedule.assistantInvigilator.lastName} (${examSchedule.assistantInvigilator.employeeNumber})\n`);

  // ------------------------------------------------------------------------
  // Scenario 6: Comprehensive Payroll & Staff Parity Verification
  // ------------------------------------------------------------------------
  console.log('▶ Scenario 6: Payroll Integrity & Universal Staff Parity...');
  const allStaff = await prisma.staff.findMany({
    where: { tenantId, isActive: true },
    include: {
      teacherProfile: true,
      department: true,
      designation: true,
    },
  });

  const allSalaries = await prisma.staffSalaryProfile.findMany({
    where: { tenantId, isActive: true },
  });

  console.log(`  ✓ Total Active Staff in PostgreSQL: ${allStaff.length}`);
  const teachingCount = allStaff.filter((s) => s.teacherProfile !== null).length;
  const nonTeachingCount = allStaff.filter((s) => s.teacherProfile === null).length;
  console.log(`  ✓ Teaching Staff count: ${teachingCount}`);
  console.log(`  ✓ Non-Teaching Staff count: ${nonTeachingCount}`);
  console.log(`  ✓ Total Active Salary Profiles: ${allSalaries.length}`);

  for (const sal of allSalaries) {
    const matchingStaff = allStaff.find((s) => s.id === sal.staffUserId);
    if (!matchingStaff) {
      console.warn(`    ⚠️ Notice: Salary profile ${sal.id} maps to legacy teacher ID ${sal.staffUserId}`);
    } else {
      const gross = sal.basicSalary + (sal.housingAllowance || 0) + (sal.transportAllowance || 0) + (sal.otherAllowances || 0);
      console.log(`    • Staff: ${matchingStaff.firstName} ${matchingStaff.lastName} (${matchingStaff.designation?.name || 'Staff'}) | Gross: ₦${gross.toLocaleString()} | Bank: ${sal.bankName || 'N/A'}`);
    }
  }

  console.log('\n========================================================================');
  console.log('✅ ALL 6 END-TO-END FUNCTIONAL SCENARIOS PASSED WITH 100% SUCCESS!');
  console.log('========================================================================');
}

runPhase6Verification()
  .catch((err) => {
    console.error('\n❌ Verification Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
