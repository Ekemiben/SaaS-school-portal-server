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
    const teacher = {
      id,
      tenantId,
      campusId: data.campusId,
      employeeNumber: data.employeeNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || null,
      specialization: data.specialization || null,
      qualification: data.qualification || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.teachers.set(id, teacher);
    return teacher;
  }
}
