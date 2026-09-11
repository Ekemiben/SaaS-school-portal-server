import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Academic Years ---
  async getAcademicYears(tenantId: string) {
    return Array.from(this.prisma.memoryStore.academicYears.values()).filter(
      (ay) => ay.tenantId === tenantId,
    );
  }

  async createAcademicYear(tenantId: string, data: { name: string; startDate: string; endDate: string; isCurrent?: boolean }) {
    const id = `ay_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newYear = {
      id,
      tenantId,
      name: data.name,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      isCurrent: !!data.isCurrent,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.academicYears.set(id, newYear);
    return newYear;
  }

  // --- Terms ---
  async getTerms(tenantId: string, academicYearId?: string) {
    return Array.from(this.prisma.memoryStore.terms.values()).filter(
      (t) => t.tenantId === tenantId && (!academicYearId || t.academicYearId === academicYearId),
    );
  }

  async createTerm(tenantId: string, data: { academicYearId: string; name: string; startDate: string; endDate: string; isCurrent?: boolean }) {
    const id = `term_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newTerm = {
      id,
      tenantId,
      academicYearId: data.academicYearId,
      name: data.name,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      isCurrent: !!data.isCurrent,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.terms.set(id, newTerm);
    return newTerm;
  }

  // --- Classes ---
  async getClasses(tenantId: string, campusId?: string) {
    return Array.from(this.prisma.memoryStore.classes.values()).filter(
      (c) => c.tenantId === tenantId && (!campusId || c.campusId === campusId),
    );
  }

  async createClass(tenantId: string, data: { campusId: string; academicYearId: string; name: string; gradeLevel: string; stream?: string; capacity?: number }) {
    const id = `cls_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newClass = {
      id,
      tenantId,
      campusId: data.campusId,
      academicYearId: data.academicYearId,
      name: data.name,
      gradeLevel: data.gradeLevel,
      stream: data.stream || null,
      capacity: data.capacity || 40,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.classes.set(id, newClass);
    return newClass;
  }

  // --- Subjects ---
  async getSubjects(tenantId: string) {
    return Array.from(this.prisma.memoryStore.subjects.values()).filter(
      (s) => s.tenantId === tenantId,
    );
  }

  async createSubject(tenantId: string, data: { code: string; name: string; description?: string; isElective?: boolean }) {
    const id = `sub_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newSub = {
      id,
      tenantId,
      code: data.code.toUpperCase(),
      name: data.name,
      description: data.description || null,
      isElective: !!data.isElective,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.subjects.set(id, newSub);
    return newSub;
  }
}
