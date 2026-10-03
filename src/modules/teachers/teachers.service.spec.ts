import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TeachersService } from './teachers.service.js';
import { StaffMasterDataService } from './services/staff-master-data.service.js';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { SystemPermissions } from '../../common/constants/permissions.js';

describe('Step 1 Staff Master & Onboarding Integrity Verification', () => {
  let teachersService: TeachersService;
  let masterDataService: StaffMasterDataService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      isDbConnected: true,
      subscription: { findFirst: vi.fn().mockResolvedValue({ maxStaff: 100 }) },
      teacher: {
        count: vi.fn().mockResolvedValue(5),
        findFirst: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
      campus: { findFirst: vi.fn() },
      class: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      department: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
      designation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
      staffRoom: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
      staffSalaryProfile: { upsert: vi.fn() },
      $transaction: vi.fn(async (callback) => callback(mockPrisma)),
      memoryStore: { teachers: new Map() },
    };

    teachersService = new TeachersService(mockPrisma as any);
    masterDataService = new StaffMasterDataService(mockPrisma as any);
  });

  const tenantA = 'tenant_school_a';
  const tenantB = 'tenant_school_b';
  const campusMain = 'cmp_main_01';
  const campusBranch = 'cmp_branch_02';

  const adminUser = { role: 'ADMIN', permissions: [SystemPermissions.PAYROLL_MANAGE, SystemPermissions.TEACHERS_MANAGE] };
  const teacherUser = { role: 'TEACHER', permissions: [SystemPermissions.TEACHERS_VIEW] };

  // Test 1: Same-tenant Department assignment
  it('1. should successfully assign department within the same tenant', async () => {
    mockPrisma.campus.findFirst.mockResolvedValue({ id: campusMain, tenantId: tenantA });
    mockPrisma.department.findFirst.mockResolvedValue({ id: 'dept_sci', tenantId: tenantA, name: 'Sciences' });
    mockPrisma.teacher.create.mockResolvedValue({
      id: 'tch_01',
      tenantId: tenantA,
      campusId: campusMain,
      employeeNumber: 'EMP-2026-001',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@school.edu',
      departmentId: 'dept_sci',
      department: { name: 'Sciences' },
    });

    const result = await teachersService.create(tenantA, {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@school.edu',
      departmentId: 'dept_sci',
      campusId: campusMain,
    }, adminUser);

    expect(result.department).toBe('Sciences');
    expect(result.departmentId).toBe('dept_sci');
  });

  // Test 2: Cross-tenant Department rejection
  it('2. should reject department assignment from a different tenant', async () => {
    mockPrisma.campus.findFirst.mockResolvedValue({ id: campusMain, tenantId: tenantA });
    mockPrisma.department.findFirst.mockResolvedValue(null); // Not found in tenantA

    await expect(
      teachersService.create(tenantA, {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@school.edu',
        departmentId: 'dept_tenant_b',
        campusId: campusMain,
      }, adminUser),
    ).rejects.toThrow(ForbiddenException);
  });

  // Test 3: Same-tenant Designation assignment
  it('3. should successfully assign designation within the same tenant', async () => {
    mockPrisma.campus.findFirst.mockResolvedValue({ id: campusMain, tenantId: tenantA });
    mockPrisma.designation.findFirst.mockResolvedValue({ id: 'desig_hod', tenantId: tenantA, name: 'HOD' });
    mockPrisma.teacher.create.mockResolvedValue({
      id: 'tch_02',
      tenantId: tenantA,
      campusId: campusMain,
      employeeNumber: 'EMP-2026-002',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@school.edu',
      designationId: 'desig_hod',
      designation: { name: 'HOD' },
    });

    const result = await teachersService.create(tenantA, {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@school.edu',
      designationId: 'desig_hod',
      campusId: campusMain,
    }, adminUser);

    expect(result.designation).toBe('HOD');
    expect(result.designationId).toBe('desig_hod');
  });

  // Test 4: Cross-tenant Designation rejection
  it('4. should reject designation assignment from a different tenant', async () => {
    mockPrisma.campus.findFirst.mockResolvedValue({ id: campusMain, tenantId: tenantA });
    mockPrisma.designation.findFirst.mockResolvedValue(null);

    await expect(
      teachersService.create(tenantA, {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@school.edu',
        designationId: 'desig_tenant_b',
        campusId: campusMain,
      }, adminUser),
    ).rejects.toThrow(ForbiddenException);
  });

  // Test 5: Same-campus StaffRoom assignment
  it('5. should successfully assign staff room matching the staff member campus', async () => {
    mockPrisma.campus.findFirst.mockResolvedValue({ id: campusMain, tenantId: tenantA });
    mockPrisma.staffRoom.findFirst.mockResolvedValue({ id: 'room_101', tenantId: tenantA, campusId: campusMain, name: 'Main Staff Room' });
    mockPrisma.teacher.create.mockResolvedValue({
      id: 'tch_03',
      tenantId: tenantA,
      campusId: campusMain,
      employeeNumber: 'EMP-2026-003',
      firstName: 'Alan',
      lastName: 'Turing',
      email: 'alan.turing@school.edu',
      staffRoomId: 'room_101',
      staffRoom: { name: 'Main Staff Room' },
    });

    const result = await teachersService.create(tenantA, {
      firstName: 'Alan',
      lastName: 'Turing',
      email: 'alan.turing@school.edu',
      staffRoomId: 'room_101',
      campusId: campusMain,
    }, adminUser);

    expect(result.officeLocation).toBe('Main Staff Room');
    expect(result.staffRoomId).toBe('room_101');
  });

  // Test 6: Cross-campus StaffRoom rejection
  it('6. should reject staff room assignment from an incompatible campus', async () => {
    mockPrisma.campus.findFirst.mockResolvedValue({ id: campusMain, tenantId: tenantA });
    mockPrisma.staffRoom.findFirst.mockResolvedValue({ id: 'room_branch', tenantId: tenantA, campusId: campusBranch, name: 'Branch Room' });

    await expect(
      teachersService.create(tenantA, {
        firstName: 'Alan',
        lastName: 'Turing',
        email: 'alan.turing@school.edu',
        staffRoomId: 'room_branch',
        campusId: campusMain,
      }, adminUser),
    ).rejects.toThrow(BadRequestException);
  });

  // Test 7: School-wide StaffRoom assignment (campusId = null)
  it('7. should allow assignment of school-wide staff room (campusId = null) across any campus', async () => {
    mockPrisma.campus.findFirst.mockResolvedValue({ id: campusMain, tenantId: tenantA });
    mockPrisma.staffRoom.findFirst.mockResolvedValue({ id: 'room_global', tenantId: tenantA, campusId: null, name: 'Central Staff Hub' });
    mockPrisma.teacher.create.mockResolvedValue({
      id: 'tch_04',
      tenantId: tenantA,
      campusId: campusMain,
      employeeNumber: 'EMP-2026-004',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace.hopper@school.edu',
      staffRoomId: 'room_global',
      staffRoom: { name: 'Central Staff Hub' },
    });

    const result = await teachersService.create(tenantA, {
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace.hopper@school.edu',
      staffRoomId: 'room_global',
      campusId: campusMain,
    }, adminUser);

    expect(result.officeLocation).toBe('Central Staff Hub');
  });

  // Test 8: Cross-tenant StaffRoom rejection
  it('8. should reject staff room assignment belonging to another tenant', async () => {
    mockPrisma.campus.findFirst.mockResolvedValue({ id: campusMain, tenantId: tenantA });
    mockPrisma.staffRoom.findFirst.mockResolvedValue(null);

    await expect(
      teachersService.create(tenantA, {
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace.hopper@school.edu',
        staffRoomId: 'room_tenant_b',
        campusId: campusMain,
      }, adminUser),
    ).rejects.toThrow(ForbiddenException);
  });

  // Test 9: Same-tenant Department head
  it('9. should allow assigning department head from the same tenant', async () => {
    mockPrisma.teacher.findFirst.mockResolvedValue({ id: 'tch_head_01', tenantId: tenantA });
    mockPrisma.department.findFirst.mockResolvedValue(null); // uniqueness check passes
    mockPrisma.department.create.mockResolvedValue({
      id: 'dept_01',
      tenantId: tenantA,
      name: 'Languages',
      code: 'LANG',
      headStaffId: 'tch_head_01',
    });

    const dept = await masterDataService.createDepartment(tenantA, {
      name: 'Languages',
      code: 'LANG',
      headStaffId: 'tch_head_01',
    });

    expect(dept.headStaffId).toBe('tch_head_01');
  });

  // Test 10: Cross-tenant Department head rejection
  it('10. should reject department head from a different tenant', async () => {
    mockPrisma.teacher.findFirst.mockResolvedValue(null); // not found in tenantA

    await expect(
      masterDataService.createDepartment(tenantA, {
        name: 'Languages',
        code: 'LANG',
        headStaffId: 'tch_from_tenant_b',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // Test 11: Unauthorized salary/bank payload rejection
  it('11. should reject financial/salary fields when caller lacks PAYROLL_MANAGE permission', async () => {
    await expect(
      teachersService.create(tenantA, {
        firstName: 'Eve',
        lastName: 'Staff',
        email: 'eve@school.edu',
        basicSalary: 300000,
        bankName: 'First Bank',
        accountNumber: '1234567890',
      }, teacherUser), // lacks PAYROLL_MANAGE
    ).rejects.toThrow(ForbiddenException);
  });

  // Test 12: Authorized salary/bank payload acceptance
  it('12. should accept and upsert salary profile when caller has PAYROLL_MANAGE permission', async () => {
    mockPrisma.campus.findFirst.mockResolvedValue({ id: campusMain, tenantId: tenantA });
    mockPrisma.teacher.create.mockResolvedValue({
      id: 'tch_fin_01',
      tenantId: tenantA,
      campusId: campusMain,
      employeeNumber: 'EMP-2026-005',
      firstName: 'Alice',
      lastName: 'Bursar',
      email: 'alice.bursar@school.edu',
    });

    await teachersService.create(tenantA, {
      firstName: 'Alice',
      lastName: 'Bursar',
      email: 'alice.bursar@school.edu',
      basicSalary: 250000,
      housingAllowance: 50000,
      bankName: 'Zenith Bank Plc',
      accountNumber: '1029384756',
    }, adminUser);

    expect(mockPrisma.staffSalaryProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_staffUserId: { tenantId: tenantA, staffUserId: 'tch_fin_01' } },
        create: expect.objectContaining({
          staffUserId: 'tch_fin_01',
          basicSalary: 250000,
          housingAllowance: 50000,
          bankName: 'Zenith Bank Plc',
          accountNumber: '1029384756',
        }),
      }),
    );
  });

  // Test 13: Atomic rollback when salary creation fails
  it('13. should roll back entire teacher creation when salary upsert fails inside transaction', async () => {
    mockPrisma.campus.findFirst.mockResolvedValue({ id: campusMain, tenantId: tenantA });
    mockPrisma.teacher.create.mockResolvedValue({ id: 'tch_fail_test', tenantId: tenantA });
    mockPrisma.staffSalaryProfile.upsert.mockRejectedValue(new Error('PostgreSQL constraint failure'));

    await expect(
      teachersService.create(tenantA, {
        firstName: 'Fail',
        lastName: 'User',
        email: 'fail.user@school.edu',
        basicSalary: 200000,
      }, adminUser),
    ).rejects.toThrow('PostgreSQL constraint failure');
  });

  // Test 14: Existing Teacher records with NULL relational fields work with legacy fallbacks
  it('14. should format existing legacy teacher records with NULL relations using string fallbacks', async () => {
    mockPrisma.teacher.findFirst.mockResolvedValue({
      id: 'tch_legacy_01',
      tenantId: tenantA,
      campusId: campusMain,
      employeeNumber: 'EMP-2024-099',
      firstName: 'Legacy',
      lastName: 'Educator',
      email: 'legacy@school.edu',
      specialization: 'Physics Department',
      officeLocation: 'Room B12 Legacy',
      assignedClass: 'Grade 10A',
      subjectsTaught: 'Physics, Chemistry',
      departmentId: null,
      designationId: null,
      staffRoomId: null,
      department: null,
      designation: null,
      staffRoom: null,
      classSubjects: [],
      classes: [{ id: 'cls_10a', name: 'Grade 10A' }],
    });

    const teacher = await teachersService.findById(tenantA, 'tch_legacy_01');

    expect(teacher.department).toBe('Physics Department');
    expect(teacher.officeLocation).toBe('Room B12 Legacy');
    expect(teacher.assignedClass).toBe('Grade 10A');
    expect(teacher.subjectsTaught).toEqual(['Physics', 'Chemistry']);
    expect(teacher.departmentId).toBeNull();
    expect(teacher.designationId).toBeNull();
    expect(teacher.staffRoomId).toBeNull();
  });
});
