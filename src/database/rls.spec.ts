import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaService } from './prisma.service.js';
import { RlsHelper } from './rls.helper.js';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('PostgreSQL Row-Level Security & Cross-Tenant Isolation (Task 2)', () => {
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;

  const TENANT_A = 'tenant_alpha_111';
  const TENANT_B = 'tenant_beta_222';

  beforeEach(() => {
    prisma = new PrismaService();
    rlsHelper = new RlsHelper(prisma);

    // Seed test data for Tenant A
    prisma.memoryStore.tenants.set(TENANT_A, {
      id: TENANT_A,
      name: 'Alpha High School',
      slug: 'alpha',
      status: 'ACTIVE',
    });
    prisma.memoryStore.campuses.set('campus_a_1', {
      id: 'campus_a_1',
      tenantId: TENANT_A,
      name: 'Alpha North Campus',
    });
    prisma.memoryStore.students.set('student_a_1', {
      id: 'student_a_1',
      tenantId: TENANT_A,
      campusId: 'campus_a_1',
      admissionNumber: 'ALPHA-001',
      firstName: 'Alice',
      lastName: 'Alpha',
    });
    prisma.memoryStore.invoices.set('inv_a_1', {
      id: 'inv_a_1',
      tenantId: TENANT_A,
      studentId: 'student_a_1',
      totalAmount: 500,
    });

    // Seed test data for Tenant B
    prisma.memoryStore.tenants.set(TENANT_B, {
      id: TENANT_B,
      name: 'Beta Academy',
      slug: 'beta',
      status: 'ACTIVE',
    });
    prisma.memoryStore.campuses.set('campus_b_1', {
      id: 'campus_b_1',
      tenantId: TENANT_B,
      name: 'Beta South Campus',
    });
    prisma.memoryStore.students.set('student_b_1', {
      id: 'student_b_1',
      tenantId: TENANT_B,
      campusId: 'campus_b_1',
      admissionNumber: 'BETA-001',
      firstName: 'Bob',
      lastName: 'Beta',
    });
    prisma.memoryStore.invoices.set('inv_b_1', {
      id: 'inv_b_1',
      tenantId: TENANT_B,
      studentId: 'student_b_1',
      totalAmount: 1200,
    });
  });

  describe('1. SELECT Isolation', () => {
    it('should allow Tenant A to select its own records', async () => {
      await rlsHelper.withTenantContext(TENANT_A, async (tx) => {
        const student = tx.memoryStore.students.get('student_a_1');
        expect(student).toBeDefined();
        expect(student.firstName).toBe('Alice');
        expect(student.tenantId).toBe(TENANT_A);
      });
    });

    it('should strictly hide Tenant B records from Tenant A (returns undefined)', async () => {
      await rlsHelper.withTenantContext(TENANT_A, async (tx) => {
        const studentB = tx.memoryStore.students.get('student_b_1');
        expect(studentB).toBeUndefined();

        const hasB = tx.memoryStore.students.has('student_b_1');
        expect(hasB).toBe(false);

        const allStudents = Array.from(tx.memoryStore.students.values());
        expect(allStudents.some((s) => s.tenantId === TENANT_B)).toBe(false);
        expect(allStudents.every((s) => s.tenantId === TENANT_A)).toBe(true);
      });
    });

    it('should strictly hide Tenant A records from Tenant B', async () => {
      await rlsHelper.withTenantContext(TENANT_B, async (tx) => {
        const studentA = tx.memoryStore.students.get('student_a_1');
        expect(studentA).toBeUndefined();

        const allCampuses = Array.from(tx.memoryStore.campuses.values());
        expect(allCampuses.some((c) => c.tenantId === TENANT_A)).toBe(false);
        expect(allCampuses.every((c) => c.tenantId === TENANT_B)).toBe(true);
      });
    });
  });

  describe('2. INSERT Isolation', () => {
    it('should permit Tenant A to insert records with Tenant A identifier', async () => {
      await rlsHelper.withTenantContext(TENANT_A, async (tx) => {
        tx.memoryStore.students.set('student_a_2', {
          id: 'student_a_2',
          tenantId: TENANT_A,
          campusId: 'campus_a_1',
          firstName: 'Aaron',
        });

        const created = tx.memoryStore.students.get('student_a_2');
        expect(created).toBeDefined();
        expect(created.firstName).toBe('Aaron');
      });
    });

    it('should block Tenant A from inserting records tagged with Tenant B ID', async () => {
      await rlsHelper.withTenantContext(TENANT_A, async (tx) => {
        expect(() => {
          tx.memoryStore.students.set('student_b_spoofed', {
            id: 'student_b_spoofed',
            tenantId: TENANT_B, // Foreign tenant spoof attempt
            firstName: 'Malicious',
          });
        }).toThrow(ForbiddenException);
      });
    });
  });

  describe('3. UPDATE Isolation', () => {
    it('should permit Tenant A to update its own records', async () => {
      await rlsHelper.withTenantContext(TENANT_A, async (tx) => {
        const student = tx.memoryStore.students.get('student_a_1');
        student.firstName = 'Alice Updated';
        tx.memoryStore.students.set('student_a_1', student);

        const updated = tx.memoryStore.students.get('student_a_1');
        expect(updated.firstName).toBe('Alice Updated');
      });
    });

    it('should prevent Tenant A from updating Tenant B records by changing ownership', async () => {
      await rlsHelper.withTenantContext(TENANT_A, async (tx) => {
        expect(() => {
          tx.memoryStore.students.set('student_b_1', {
            id: 'student_b_1',
            tenantId: TENANT_B,
            firstName: 'Hijacked',
          });
        }).toThrow(ForbiddenException);
      });
    });
  });

  describe('4. DELETE Isolation', () => {
    it('should permit Tenant A to delete its own records', async () => {
      await rlsHelper.withTenantContext(TENANT_A, async (tx) => {
        const deleted = tx.memoryStore.students.delete('student_a_1');
        expect(deleted).toBe(true);
        expect(tx.memoryStore.students.get('student_a_1')).toBeUndefined();
      });
    });

    it('should prevent Tenant A from deleting Tenant B records', async () => {
      await rlsHelper.withTenantContext(TENANT_A, async (tx) => {
        expect(() => {
          tx.memoryStore.students.delete('student_b_1');
        }).toThrow(ForbiddenException);
      });
    });
  });

  describe('5. Relation Access & Nested Queries', () => {
    it('should only resolve relations belonging to the current tenant context', async () => {
      await rlsHelper.withTenantContext(TENANT_A, async (tx) => {
        // Query student and follow relation to campus and invoice
        const student = tx.memoryStore.students.get('student_a_1');
        const campus = tx.memoryStore.campuses.get(student.campusId);
        const invoice = tx.memoryStore.invoices.get('inv_a_1');

        expect(campus).toBeDefined();
        expect(campus.tenantId).toBe(TENANT_A);
        expect(invoice).toBeDefined();
        expect(invoice.tenantId).toBe(TENANT_A);

        // Foreign relations must not be accessible
        const foreignCampus = tx.memoryStore.campuses.get('campus_b_1');
        expect(foreignCampus).toBeUndefined();
        const foreignInvoice = tx.memoryStore.invoices.get('inv_b_1');
        expect(foreignInvoice).toBeUndefined();
      });
    });
  });

  describe('6. Transaction Operations & PostgreSQL Native RLS', () => {
    it('should execute SET LOCAL app.current_tenant_id within transaction on live DB', async () => {
      prisma.isDbConnected = true;

      const executeRawSpy = vi.fn().mockResolvedValue(1);
      const txMock = {
        $executeRaw: executeRawSpy,
      } as any;

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb(txMock);
      });

      const result = await rlsHelper.withTenantContext(TENANT_A, async () => {
        return 'executed_in_rls_tx';
      });

      expect(result).toBe('executed_in_rls_tx');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(executeRawSpy).toHaveBeenCalled();
    });

    it('should safely propagate errors from inside transaction without swallowing', async () => {
      prisma.isDbConnected = true;

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const txMock = { $executeRaw: vi.fn().mockResolvedValue(1) };
        return cb(txMock);
      });

      await expect(
        rlsHelper.withTenantContext(TENANT_A, async () => {
          throw new Error('Database transaction failed intentionally');
        }),
      ).rejects.toThrow('Database transaction failed intentionally');
    });
  });

  describe('7. Security: Input Validation & Injection Prevention', () => {
    it('should reject malformed or injection-attempt tenant IDs', () => {
      expect(() => rlsHelper.validateTenantId("tenant'; DROP TABLE--")).toThrow(BadRequestException);
      expect(() => rlsHelper.validateTenantId('')).toThrow(BadRequestException);
      expect(() => rlsHelper.validateTenantId('   ')).toThrow(BadRequestException);
      expect(() => rlsHelper.validateTenantId('tenant with spaces')).toThrow(BadRequestException);
    });

    it('should assert tenant ownership accurately', () => {
      expect(() =>
        rlsHelper.assertTenantOwnership(TENANT_A, TENANT_B, 'Student'),
      ).toThrow(ForbiddenException);

      expect(() =>
        rlsHelper.assertTenantOwnership(TENANT_A, TENANT_A, 'Student'),
      ).not.toThrow();
    });
  });
});
