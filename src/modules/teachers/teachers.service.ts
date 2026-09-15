import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, campusId?: string) {
    return Array.from(this.prisma.memoryStore.teachers.values()).filter(
      (t) => t.tenantId === tenantId && (!campusId || t.campusId === campusId),
    );
  }

  async findById(tenantId: string, teacherId: string) {
    const teacher = this.prisma.memoryStore.teachers.get(teacherId);
    if (!teacher || teacher.tenantId !== tenantId) {
      throw new NotFoundException('Teacher not found in this school');
    }
    return teacher;
  }

  async create(tenantId: string, data: any) {
    const id = `tch_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const firstName = data.firstName || data.fullName?.split(' ')[0] || 'Teacher';
    const lastName = data.lastName || data.fullName?.split(' ').slice(1).join(' ') || '';
    const fullName = data.fullName || `${firstName} ${lastName}`.trim();

    const teacher = {
      ...data,
      id,
      tenantId,
      campusId: data.campusId || 'campus_main_01',
      employeeNumber:
        data.employeeNumber ||
        `EMP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      employeeId:
        data.employeeId ||
        data.employeeNumber ||
        `EMP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      firstName,
      lastName,
      fullName,
      email: data.email,
      phone: data.phone || null,
      department: data.department || 'Sciences',
      role: data.role || 'Subject Teacher',
      specialization: data.specialization || null,
      qualification: data.qualification || null,
      status: data.status || 'Active',
      isActive: data.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.teachers.set(id, teacher);
    return teacher;
  }

  async update(tenantId: string, teacherId: string, data: any) {
    const teacher = await this.findById(tenantId, teacherId);
    Object.assign(teacher, data, { updatedAt: new Date() });
    if (data.firstName || data.lastName) {
      teacher.fullName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
    }
    this.prisma.memoryStore.teachers.set(teacherId, teacher);
    return teacher;
  }

  async delete(tenantId: string, teacherId: string) {
    await this.findById(tenantId, teacherId);
    this.prisma.memoryStore.teachers.delete(teacherId);
    return { success: true, message: 'Teacher record removed successfully' };
  }
}
