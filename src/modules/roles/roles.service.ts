import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(_tenantId: string) {
    return [
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
  }

  async listPermissions() {
    return Object.entries(SystemPermissions).map(([key, value]) => ({
      key,
      permission: value,
      module: value.split('.')[0],
    }));
  }
}
