import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { RlsHelper } from '../src/database/rls.helper.js';

describe('PostgreSQL Native Row-Level Security (Task 2)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;

  const tenantA = 'tenant_rls_alpha_01';
  const tenantB = 'tenant_rls_beta_02';

  const campusAId = 'campus_rls_alpha_01';
  const campusBId = 'campus_rls_beta_02';

  const studentAId = 'student_rls_alpha_01';
  const studentBId = 'student_rls_beta_02';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    rlsHelper = new RlsHelper(prisma);

    // Setup two distinct tenants with campus and student data using bypass context
    await rlsHelper.withBypassContext(async (tx) => {
      // Clean up previous test artifacts if any
      await tx.student.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });

      // Create Tenant A
      await tx.tenant.create({
        data: {
          id: tenantA,
          name: 'Alpha International School',
          slug: 'alpha-school-rls',
        },
      });

      // Create Tenant B
      await tx.tenant.create({
        data: {
          id: tenantB,
          name: 'Beta Science Academy',
          slug: 'beta-school-rls',
        },
      });

      // Create Campus for Tenant A
      await tx.campus.create({
        data: {
          id: campusAId,
          tenantId: tenantA,
          name: 'Alpha Main Campus',
          code: 'ALPHA-01',
        },
      });

      // Create Campus for Tenant B
      await tx.campus.create({
        data: {
          id: campusBId,
          tenantId: tenantB,
          name: 'Beta Main Campus',
          code: 'BETA-01',
        },
      });

      // Create Student for Tenant A
      await tx.student.create({
        data: {
          id: studentAId,
          tenantId: tenantA,
          campusId: campusAId,
          admissionNumber: 'ADM-ALPHA-001',
          firstName: 'Alice',
          lastName: 'Alpha',
          gender: 'Female',
        },
      });

      // Create Student for Tenant B
      await tx.student.create({
        data: {
          id: studentBId,
          tenantId: tenantB,
          campusId: campusBId,
          admissionNumber: 'ADM-BETA-001',
          firstName: 'Bob',
          lastName: 'Beta',
          gender: 'Male',
        },
      });
    });
  });

  afterAll(async () => {
    // Cleanup in bypass context
    await rlsHelper.withBypassContext(async (tx) => {
      await tx.student.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.campus.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    });
    await prisma.onModuleDestroy();
  });

  it('1. SELECT Isolation: Tenant A context must only read Tenant A records and never Tenant B', async () => {
    await rlsHelper.withTenantContext(tenantA, async (tx) => {
      // Find all students in Tenant A session
      const students = await tx.student.findMany();
      expect(students.length).toBe(1);
      expect(students[0].id).toBe(studentAId);
      expect(students[0].tenantId).toBe(tenantA);

      // Attempt to find Tenant B student by direct ID
      const studentB = await tx.student.findUnique({ where: { id: studentBId } });
      expect(studentB).toBeNull();
    });
  });

  it('2. INSERT Isolation: Tenant A session must NOT be permitted to insert records for Tenant B', async () => {
    await rlsHelper.withTenantContext(tenantA, async (tx) => {
      // Valid insert for Tenant A succeeds
      const newStudentA = await tx.student.create({
        data: {
          id: 'student_rls_alpha_02',
          tenantId: tenantA,
          campusId: campusAId,
          admissionNumber: 'ADM-ALPHA-002',
          firstName: 'Aaron',
          lastName: 'Alpha',
          gender: 'Male',
        },
      });
      expect(newStudentA.id).toBe('student_rls_alpha_02');

      // Cross-tenant insert for Tenant B must be blocked by PostgreSQL RLS policy
      await expect(
        tx.student.create({
          data: {
            id: 'student_rls_beta_injected',
            tenantId: tenantB,
            campusId: campusBId,
            admissionNumber: 'ADM-BETA-999',
            firstName: 'Injected',
            lastName: 'Student',
            gender: 'Male',
          },
        }),
      ).rejects.toThrow();
    });
  });

  it('3. UPDATE Isolation: Tenant A session must NOT be able to modify Tenant B records', async () => {
    await rlsHelper.withTenantContext(tenantA, async (tx) => {
      // Attempting to update Tenant B record should fail with RecordNotFound because RLS filters it out
      await expect(
        tx.student.update({
          where: { id: studentBId },
          data: { firstName: 'HackedName' },
        }),
      ).rejects.toThrow();

      // Bulk update affecting Tenant B returns count 0
      const updateResult = await tx.student.updateMany({
        where: { id: studentBId },
        data: { firstName: 'HackedName' },
      });
      expect(updateResult.count).toBe(0);
    });

    // Verify Bob Beta remained unmodified
    await rlsHelper.withBypassContext(async (tx) => {
      const bob = await tx.student.findUnique({ where: { id: studentBId } });
      expect(bob?.firstName).toBe('Bob');
    });
  });

  it('4. DELETE Isolation: Tenant A session must NOT be able to delete Tenant B records', async () => {
    await rlsHelper.withTenantContext(tenantA, async (tx) => {
      // Attempting to delete Tenant B record by ID should fail
      await expect(
        tx.student.delete({
          where: { id: studentBId },
        }),
      ).rejects.toThrow();

      // Bulk delete for Tenant B returns 0
      const deleteResult = await tx.student.deleteMany({
        where: { id: studentBId },
      });
      expect(deleteResult.count).toBe(0);
    });

    // Verify Bob Beta still exists
    await rlsHelper.withBypassContext(async (tx) => {
      const bob = await tx.student.findUnique({ where: { id: studentBId } });
      expect(bob).toBeDefined();
    });
  });

  it('5. Relation & Nested Query Isolation: Nested relations only return records within tenant scope', async () => {
    await rlsHelper.withTenantContext(tenantA, async (tx) => {
      const campuses = await tx.campus.findMany({
        include: {
          students: true,
        },
      });

      expect(campuses.length).toBe(1);
      expect(campuses[0].id).toBe(campusAId);
      expect(campuses[0].tenantId).toBe(tenantA);
      expect(campuses[0].students.every((s) => s.tenantId === tenantA)).toBe(true);
    });
  });

  it('6. Transaction Integrity: Context remains bound throughout multi-operation transactions', async () => {
    await rlsHelper.withTenantContext(tenantB, async (tx) => {
      const students = await tx.student.findMany();
      expect(students.length).toBe(1);
      expect(students[0].id).toBe(studentBId);

      const campuses = await tx.campus.findMany();
      expect(campuses.length).toBe(1);
      expect(campuses[0].id).toBe(campusBId);
    });
  });

  it('7. Bypass Context: Platform admin can observe across tenants for maintenance', async () => {
    await rlsHelper.withBypassContext(async (tx) => {
      const allStudents = await tx.student.findMany({
        where: { tenantId: { in: [tenantA, tenantB] } },
      });
      expect(allStudents.length).toBeGreaterThanOrEqual(2);
    });
  });
});
