import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    filters: {
      campusId?: string;
      classId?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);

    let all = Array.from(this.prisma.memoryStore.students.values()).filter(
      (s: any) => s.tenantId === tenantId,
    );

    if (filters.campusId) {
      all = all.filter((s: any) => s.campusId === filters.campusId);
    }

    if (filters.classId) {
      const targetClass = filters.classId.toLowerCase();
      all = all.filter(
        (s: any) =>
          (s.classId && s.classId.toLowerCase() === targetClass) ||
          (s.classLevel && s.classLevel.toLowerCase() === targetClass),
      );
    }

    if (filters.status) {
      const targetStatus = filters.status.toLowerCase();
      all = all.filter(
        (s: any) => s.status && s.status.toLowerCase() === targetStatus,
      );
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      all = all.filter(
        (s: any) =>
          (s.firstName || '').toLowerCase().includes(q) ||
          (s.lastName || '').toLowerCase().includes(q) ||
          (s.middleName || '').toLowerCase().includes(q) ||
          (s.admissionNumber || '').toLowerCase().includes(q) ||
          (s.guardianName || '').toLowerCase().includes(q),
      );
    }

    const total = all.length;
    const items = all.slice((page - 1) * limit, page * limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(tenantId: string, studentId: string) {
    // Section 21: Never query student without tenantId scope
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student record not found in this school.');
    }

    // Attach campus and enrollment history
    const campus = this.prisma.memoryStore.campuses.get(student.campusId);
    const enrollments = Array.from(this.prisma.memoryStore.enrollments.values()).filter(
      (e) => e.studentId === studentId && e.tenantId === tenantId,
    );

    return {
      ...student,
      campus,
      enrollments,
    };
  }

  async create(
    tenantId: string,
    data: {
      campusId: string;
      admissionNumber: string;
      firstName: string;
      middleName?: string;
      lastName: string;
      gender: string;
      dateOfBirth?: string;
      bloodGroup?: string;
      email?: string;
      phone?: string;
      address?: string;
      classId?: string;
      academicYearId?: string;
      status?: string;
      [key: string]: any;
    },
  ) {
    // Ensure admission number is set
    const admissionNumber =
      data.admissionNumber ||
      `SCH/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;

    // Check admission number collision in this tenant
    const existing = Array.from(this.prisma.memoryStore.students.values()).find(
      (s: any) => s.tenantId === tenantId && s.admissionNumber === admissionNumber,
    );
    if (existing) {
      throw new ConflictException(
        `A student with admission number "${admissionNumber}" already exists in this school.`,
      );
    }

    const studentId = `std_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const student = {
      ...data,
      id: studentId,
      tenantId,
      campusId: data.campusId || 'campus_001',
      admissionNumber,
      firstName: data.firstName,
      middleName: data.middleName || null,
      lastName: data.lastName,
      gender: data.gender || 'Male',
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      bloodGroup: data.bloodGroup || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      status: data.status ? data.status.toUpperCase() : 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.students.set(studentId, student);

    // If initial class is provided, create enrollment record
    if (data.classId && data.academicYearId) {
      const enrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
      this.prisma.memoryStore.enrollments.set(enrollmentId, {
        id: enrollmentId,
        tenantId,
        studentId,
        classId: data.classId,
        academicYearId: data.academicYearId,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      });
    }

    return student;
  }

  async update(tenantId: string, studentId: string, data: Partial<any>) {
    const student = await this.findById(tenantId, studentId);
    Object.assign(student, data, { updatedAt: new Date() });
    this.prisma.memoryStore.students.set(studentId, student);
    return student;
  }

  async delete(tenantId: string, studentId: string) {
    await this.findById(tenantId, studentId);
    this.prisma.memoryStore.students.delete(studentId);
    return { success: true, message: 'Student removed successfully' };
  }
}
