import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AudienceService } from '../src/modules/communications/services/audience.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AudienceType } from '../src/modules/communications/dto/audience.dto.js';
import { BadRequestException } from '@nestjs/common';

describe('Phase 3 — Audience Resolution Architecture', () => {
  let prisma: PrismaService;
  let audienceService: AudienceService;

  let tenantAlpha: string;
  let tenantBeta: string;

  let userParentAlpha: string;
  let userTeacherAlpha: string;
  let userStaffAlpha: string;
  let userParentBeta: string;

  let studentAlpha1: string;
  let studentAlpha2: string; // sibling of studentAlpha1
  let studentBeta1: string;

  let classAlpha: string;
  let routeAlpha: string;

  beforeEach(async () => {
    const timestamp = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    tenantAlpha = `tenant_aud_alpha_${timestamp}`;
    tenantBeta = `tenant_aud_beta_${timestamp}`;

    userParentAlpha = `usr_par_alpha_${timestamp}`;
    userTeacherAlpha = `usr_tch_alpha_${timestamp}`;
    userStaffAlpha = `usr_stf_alpha_${timestamp}`;
    userParentBeta = `usr_par_beta_${timestamp}`;

    studentAlpha1 = `std_alpha1_${timestamp}`;
    studentAlpha2 = `std_alpha2_${timestamp}`;
    studentBeta1 = `std_beta1_${timestamp}`;

    classAlpha = `cls_alpha_${timestamp}`;
    routeAlpha = `route_alpha_${timestamp}`;

    prisma = new PrismaService();
    await prisma.onModuleInit();
    audienceService = new AudienceService(prisma);

    if (prisma.isDbConnected) {
      try {
        await prisma.tenant.createMany({
          data: [
            { id: tenantAlpha, name: 'Alpha College', slug: `alpha-${timestamp}` },
            { id: tenantBeta, name: 'Beta Institute', slug: `beta-${timestamp}` },
          ],
        });

        // Users
        await prisma.user.createMany({
          data: [
            {
              id: userParentAlpha,
              tenantId: tenantAlpha,
              email: `parent@alpha-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Ade',
              lastName: 'Balogun',
            },
            {
              id: userTeacherAlpha,
              tenantId: tenantAlpha,
              email: `teacher@alpha-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Chidi',
              lastName: 'Okafor',
            },
            {
              id: userStaffAlpha,
              tenantId: tenantAlpha,
              email: `bursar@alpha-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Fatima',
              lastName: 'Bello',
            },
            {
              id: userParentBeta,
              tenantId: tenantBeta,
              email: `parent@beta-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Kofi',
              lastName: 'Mensah',
            },
          ],
        });

        // Roles
        const roleStaff = `role_staff_${timestamp}`;
        const roleTeacher = `role_teacher_${timestamp}`;
        await prisma.role.createMany({
          data: [
            { id: roleStaff, tenantId: tenantAlpha, name: 'STAFF' },
            { id: roleTeacher, tenantId: tenantAlpha, name: 'TEACHER' },
          ],
        });

        await prisma.userRole.createMany({
          data: [
            { id: `ur1_${timestamp}`, userId: userTeacherAlpha, roleId: roleTeacher },
            { id: `ur2_${timestamp}`, userId: userStaffAlpha, roleId: roleStaff },
          ],
        });

        // Campus
        const campusAlpha = `cmp_alpha_${timestamp}`;
        await prisma.campus.create({
          data: {
            id: campusAlpha,
            tenantId: tenantAlpha,
            name: 'Alpha Main Campus',
            code: `AMC_${timestamp}`,
          },
        });

        // Parents
        const parentRecordAlpha = `parent_alpha_${timestamp}`;
        await prisma.parent.create({
          data: {
            id: parentRecordAlpha,
            tenantId: tenantAlpha,
            userId: userParentAlpha,
            firstName: 'Ade',
            lastName: 'Balogun',
            email: `parent@alpha-${timestamp}.com`,
            phone: '+2348033334444',
          },
        });

        const parentRecordBeta = `parent_beta_${timestamp}`;
        await prisma.parent.create({
          data: {
            id: parentRecordBeta,
            tenantId: tenantBeta,
            userId: userParentBeta,
            firstName: 'Kofi',
            lastName: 'Mensah',
            email: `parent@beta-${timestamp}.com`,
            phone: '+2348099998888',
          },
        });

        // Students in Alpha (Siblings sharing parentRecordAlpha)
        await prisma.student.createMany({
          data: [
            {
              id: studentAlpha1,
              tenantId: tenantAlpha,
              campusId: campusAlpha,
              admissionNumber: `ADM1_${timestamp}`,
              firstName: 'Tunde',
              lastName: 'Balogun',
              gender: 'MALE',
              status: 'ACTIVE',
            },
            {
              id: studentAlpha2,
              tenantId: tenantAlpha,
              campusId: campusAlpha,
              admissionNumber: `ADM2_${timestamp}`,
              firstName: 'Folake',
              lastName: 'Balogun',
              gender: 'FEMALE',
              status: 'ACTIVE',
            },
          ],
        });

        // Sibling links to parent
        await prisma.studentParent.createMany({
          data: [
            { id: `sp1_${timestamp}`, studentId: studentAlpha1, parentId: parentRecordAlpha },
            { id: `sp2_${timestamp}`, studentId: studentAlpha2, parentId: parentRecordAlpha },
          ],
        });

        // Teacher
        await prisma.teacher.create({
          data: {
            id: `tch_alpha_${timestamp}`,
            tenantId: tenantAlpha,
            campusId: campusAlpha,
            userId: userTeacherAlpha,
            employeeNumber: `TCH_${timestamp}`,
            firstName: 'Chidi',
            lastName: 'Okafor',
            email: `teacher@alpha-${timestamp}.com`,
            phone: '+2348077776666',
          },
        });

        // Staff
        await prisma.staff.create({
          data: {
            id: `stf_alpha_${timestamp}`,
            tenantId: tenantAlpha,
            campusId: campusAlpha,
            userId: userStaffAlpha,
            employeeNumber: `EMP_${timestamp}`,
            firstName: 'Fatima',
            lastName: 'Bello',
            email: `bursar@alpha-${timestamp}.com`,
            phone: '+2348055554444',
          },
        });

        // Class & Academic Year
        const ayAlpha = `ay_alpha_${timestamp}`;
        await prisma.academicYear.create({
          data: {
            id: ayAlpha,
            tenantId: tenantAlpha,
            name: `2026/2027 ${timestamp}`,
            startDate: new Date('2026-09-01'),
            endDate: new Date('2027-07-31'),
          },
        });

        await prisma.class.create({
          data: {
            id: classAlpha,
            tenantId: tenantAlpha,
            campusId: campusAlpha,
            academicYearId: ayAlpha,
            name: 'Grade 10 Gold',
            gradeLevel: 'GRADE_10',
          },
        });

        // Enroll studentAlpha1 in classAlpha
        await prisma.enrollment.create({
          data: {
            id: `enr_alpha_${timestamp}`,
            tenantId: tenantAlpha,
            studentId: studentAlpha1,
            classId: classAlpha,
            academicYearId: ayAlpha,
            status: 'ACTIVE',
          },
        });

        // Invoice for fee debtors
        const feeStructureAlpha = `fee_struct_${timestamp}`;
        await prisma.feeStructure.create({
          data: {
            id: feeStructureAlpha,
            tenantId: tenantAlpha,
            campusId: campusAlpha,
            name: 'Tuition Term 1',
            amount: 150000,
            academicYearId: ayAlpha,
          },
        });

        await prisma.invoice.create({
          data: {
            id: `inv_debtor_${timestamp}`,
            tenantId: tenantAlpha,
            studentId: studentAlpha1,
            feeStructureId: feeStructureAlpha,
            invoiceNumber: `INV-${timestamp}`,
            totalAmount: 150000,
            balanceAmount: 75000,
            status: 'PARTIALLY_PAID',
            dueDate: new Date(Date.now() + 864000000),
          },
        });

        // Attendance record: studentAlpha2 marked ABSENT today
        await prisma.attendance.create({
          data: {
            id: `att_absent_${timestamp}`,
            tenantId: tenantAlpha,
            campusId: campusAlpha,
            studentId: studentAlpha2,
            classId: classAlpha,
            date: new Date(),
            status: 'ABSENT',
          },
        });

        // Transport allocation
        await prisma.transportRoute.create({
          data: {
            id: routeAlpha,
            tenantId: tenantAlpha,
            campusId: campusAlpha,
            routeName: 'Route 1 - Lekki Expressway',
            vehicleNumber: `BUS_${timestamp}`,
            driverName: 'Sunday Musa',
            driverPhone: '+2348011223344',
          },
        });

        await prisma.studentTransportAllocation.create({
          data: {
            id: `trans_alloc_${timestamp}`,
            tenantId: tenantAlpha,
            campusId: campusAlpha,
            studentId: studentAlpha1,
            routeId: routeAlpha,
            academicYearId: ayAlpha,
            status: 'ACTIVE',
          },
        });
      } catch {
        // Fallback store
      }
    }
  });

  afterEach(async () => {
    if (prisma.isDbConnected) {
      try {
        await prisma.studentTransportAllocation.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.transportRoute.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.attendance.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.invoice.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.feeStructure.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.enrollment.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.class.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.academicYear.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.staff.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.teacher.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.studentParent.deleteMany({ where: { parent: { tenantId: { in: [tenantAlpha, tenantBeta] } } } });
        await prisma.student.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.parent.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.userRole.deleteMany({ where: { user: { tenantId: { in: [tenantAlpha, tenantBeta] } } } });
        await prisma.role.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.campus.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.user.deleteMany({ where: { tenantId: { in: [tenantAlpha, tenantBeta] } } });
        await prisma.tenant.deleteMany({ where: { id: { in: [tenantAlpha, tenantBeta] } } });
      } catch {
        // Ignore cleanup errors
      }
    }
    await prisma.onModuleDestroy();
  });

  it('1. ALL_TEACHERS strictly resolves teachers and NEVER returns parents', async () => {
    const teachers = await audienceService.resolveAudience(tenantAlpha, {
      audienceType: AudienceType.ALL_TEACHERS,
    });

    expect(teachers.length).toBeGreaterThanOrEqual(1);
    teachers.forEach((t) => {
      expect(t.role).toBe('TEACHER');
      expect(t.name).toContain('Chidi');
      expect(t.userId).not.toBe(userParentAlpha);
    });
  });

  it('2. ALL_STAFF strictly resolves staff and NEVER falls through to parents', async () => {
    const staff = await audienceService.resolveAudience(tenantAlpha, {
      audienceType: AudienceType.ALL_STAFF,
    });

    expect(staff.length).toBeGreaterThanOrEqual(1);
    staff.forEach((s) => {
      expect(s.role).toBe('STAFF');
      expect(s.userId).not.toBe(userParentAlpha);
    });
  });

  it('3. Sibling Deduplication: Multiple children of the same parent yield 1 parent recipient', async () => {
    const parents = await audienceService.resolveAudience(tenantAlpha, {
      audienceType: AudienceType.ALL_PARENTS,
    });

    // Parent Ade Balogun has 2 students (Tunde and Folake), but must appear exactly ONCE
    const parentMatches = parents.filter((p) => p.userId === userParentAlpha);
    expect(parentMatches).toHaveLength(1);
    expect(parentMatches[0].role).toBe('PARENT');
  });

  it('4. CLASS_PARENTS resolves only parents of students in that class', async () => {
    const classParents = await audienceService.resolveAudience(tenantAlpha, {
      audienceType: AudienceType.CLASS_PARENTS,
      classId: classAlpha,
    });

    expect(classParents.length).toBe(1);
    expect(classParents[0].userId).toBe(userParentAlpha);
    expect(classParents[0].studentName).toBe('Tunde Balogun');
  });

  it('5. FEE_DEBTORS / PARENTS_OUTSTANDING_FEES resolves only debtor parents', async () => {
    const debtors = await audienceService.resolveAudience(tenantAlpha, {
      audienceType: AudienceType.FEE_DEBTORS,
    });

    expect(debtors.length).toBe(1);
    expect(debtors[0].userId).toBe(userParentAlpha);
    expect(debtors[0].balanceAmount).toBe(75000);
  });

  it('6. PARENTS_ABSENT_TODAY resolves parents of students absent today', async () => {
    const absentParents = await audienceService.resolveAudience(tenantAlpha, {
      audienceType: AudienceType.PARENTS_ABSENT_TODAY,
    });

    expect(absentParents.length).toBe(1);
    expect(absentParents[0].userId).toBe(userParentAlpha);
    expect(absentParents[0].studentName).toBe('Folake Balogun');
  });

  it('7. TRANSPORT_ROUTE_PARENTS resolves parents on the specific route', async () => {
    const routeParents = await audienceService.resolveAudience(tenantAlpha, {
      audienceType: AudienceType.TRANSPORT_ROUTE_PARENTS,
      routeId: routeAlpha,
    });

    expect(routeParents.length).toBe(1);
    expect(routeParents[0].userId).toBe(userParentAlpha);
  });

  it('8. Controlled Error on Unsupported Audience: Throws error and NEVER returns parents', async () => {
    await expect(
      audienceService.resolveAudience(tenantAlpha, {
        audienceType: 'UNSUPPORTED_RANDOM_AUDIENCE' as any,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('9. Tenant Isolation: Audience queries NEVER leak recipients across tenants', async () => {
    const alphaParents = await audienceService.resolveAudience(tenantAlpha, {
      audienceType: AudienceType.ALL_PARENTS,
    });

    const betaParents = await audienceService.resolveAudience(tenantBeta, {
      audienceType: AudienceType.ALL_PARENTS,
    });

    expect(alphaParents.find((p) => p.userId === userParentBeta)).toBeUndefined();
    expect(betaParents.find((p) => p.userId === userParentAlpha)).toBeUndefined();
  });
});
