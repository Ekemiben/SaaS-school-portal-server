import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(_tenantId: string) {
    const systemRoles = [
      {
        id: 'role_school_owner',
        name: 'School Owner',
        description: 'Complete administrative access across all school campuses, finance, and settings',
        isSystem: true,
        permissions: Object.values(SystemPermissions),
      },
      {
        id: 'role_school_admin',
        name: 'School Admin',
        description: 'School administrator with management rights over academics, users, and students',
        isSystem: true,
        permissions: [
          'users.view', 'users.create', 'users.update', 'campuses.view',
          'students.view', 'students.create', 'students.update', 'students.delete',
          'academics.view', 'academics.manage', 'attendance.view', 'attendance.mark',
          'examinations.manage', 'results.enter', 'results.approve', 'results.publish',
          'fees.view', 'fees.create', 'invoices.manage', 'payments.view',
          'reports.view', 'files.manage',
        ],
      },
      {
        id: 'role_campus_admin',
        name: 'Campus Admin',
        description: 'Administrator scoped to a specific school campus',
        isSystem: true,
        permissions: [
          'campuses.view', 'students.view', 'students.create', 'students.update',
          'academics.view', 'attendance.view', 'attendance.mark',
          'results.enter', 'fees.view', 'payments.view', 'files.manage',
        ],
      },
      {
        id: 'role_teacher',
        name: 'Teacher',
        description: 'Class teacher with attendance marking and examination grading access',
        isSystem: true,
        permissions: [
          'students.view', 'academics.view', 'attendance.view', 'attendance.mark',
          'results.enter', 'files.manage',
        ],
      },
      {
        id: 'role_accountant',
        name: 'Accountant / Bursar',
        description: 'Financial bursar handling fee collection, invoices, payments, and payroll',
        isSystem: true,
        permissions: [
          'students.view', 'fees.view', 'fees.create', 'fees.manage', 'invoices.manage',
          'payments.view', 'payroll.manage', 'expenses.manage', 'reports.view',
        ],
      },
      {
        id: 'role_parent',
        name: 'Parent / Guardian',
        description: 'Parent portal access to view linked student grades, attendance, and pay fees',
        isSystem: true,
        permissions: ['students.view', 'fees.view', 'payments.view'],
      },
      {
        id: 'role_student',
        name: 'Student',
        description: 'Student portal access to view class timetable, results, and notifications',
        isSystem: true,
        permissions: ['students.view'],
      },
    ];

    const customRoles = Array.from(this.prisma.memoryStore.roles.values()).filter(
      (r) => r.tenantId === _tenantId,
    );

    return [...systemRoles, ...customRoles];
  }

  async createRole(
    tenantId: string,
    dto: { name: string; description?: string; permissions: string[] },
  ) {
    const id = `role_custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newRole = {
      id,
      tenantId,
      name: dto.name,
      description: dto.description || '',
      isSystem: false,
      permissions: dto.permissions || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.roles.set(id, newRole);
    return newRole;
  }

  async updateRole(
    tenantId: string,
    roleId: string,
    dto: { name?: string; description?: string; permissions?: string[] },
  ) {
    if (roleId.startsWith('role_school_') || roleId.startsWith('role_teacher') || roleId.startsWith('role_parent')) {
      throw new Error('System-defined default roles cannot be modified.');
    }

    const role = this.prisma.memoryStore.roles.get(roleId);
    if (!role || role.tenantId !== tenantId) {
      throw new Error('Custom role not found.');
    }

    if (dto.name) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.permissions) role.permissions = dto.permissions;
    role.updatedAt = new Date();

    this.prisma.memoryStore.roles.set(roleId, role);
    return role;
  }

  async deleteRole(tenantId: string, roleId: string) {
    if (roleId.startsWith('role_school_') || roleId.startsWith('role_teacher') || roleId.startsWith('role_parent')) {
      throw new Error('System-defined default roles cannot be deleted.');
    }

    const role = this.prisma.memoryStore.roles.get(roleId);
    if (!role || role.tenantId !== tenantId) {
      throw new Error('Custom role not found.');
    }

    this.prisma.memoryStore.roles.delete(roleId);
    return { success: true, message: 'Custom role deleted successfully.' };
  }

  async listPermissions() {
    return Object.entries(SystemPermissions).map(([key, value]) => ({
      key,
      permission: value,
      module: value.split('.')[0],
    }));
  }
}
