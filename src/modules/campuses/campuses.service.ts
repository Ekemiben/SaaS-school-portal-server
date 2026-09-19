import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class CampusesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    if (this.prisma.isDbConnected) {
      return this.prisma.campus.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
      });
    }

    return Array.from(this.prisma.memoryStore.campuses.values()).filter(
      (c) => c.tenantId === tenantId,
    );
  }

  async findById(tenantId: string, campusId: string) {
    if (this.prisma.isDbConnected) {
      const campus = await this.prisma.campus.findFirst({
        where: { id: campusId, tenantId },
      });
      if (!campus) throw new NotFoundException('Campus not found in this school');
      return campus;
    }

    const campus = this.prisma.memoryStore.campuses.get(campusId);
    if (!campus || campus.tenantId !== tenantId) {
      throw new NotFoundException('Campus not found in this school');
    }
    return campus;
  }

  async create(tenantId: string, data: {
    name: string;
    code: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    phone?: string;
    email?: string;
    isMain?: boolean;
  }) {
    if (this.prisma.isDbConnected) {
      try {
        const existingDb = await this.prisma.campus.findFirst({
          where: { tenantId, code: data.code.toUpperCase() },
        });
        if (existingDb) {
          throw new ConflictException(`Campus code "${data.code}" already exists in this school.`);
        }
      } catch (err: any) {
        if (err instanceof ConflictException) throw err;
      }
    }

    const existing = Array.from(this.prisma.memoryStore.campuses.values()).find(
      (c) => c.tenantId === tenantId && c.code.toUpperCase() === data.code.toUpperCase(),
    );
    if (existing) {
      throw new ConflictException(`Campus code "${data.code}" already exists in this school.`);
    }

    const campusId = `campus_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const newCampus = {
      id: campusId,
      tenantId,
      name: data.name,
      code: data.code.toUpperCase(),
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      country: data.country || null,
      phone: data.phone || null,
      email: data.email || null,
      isMain: !!data.isMain,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected) {
      try {
        const dbCampus = await this.prisma.campus.create({
          data: {
            id: campusId,
            tenantId,
            name: data.name,
            code: data.code.toUpperCase(),
            address: data.address || null,
            city: data.city || null,
            state: data.state || null,
            country: data.country || null,
            phone: data.phone || null,
            email: data.email || null,
            isMain: !!data.isMain,
          },
        });
        this.prisma.memoryStore.campuses.set(campusId, dbCampus);
        return dbCampus;
      } catch {}
    }

    this.prisma.memoryStore.campuses.set(campusId, newCampus);
    return newCampus;
  }

  async update(tenantId: string, campusId: string, data: Partial<any>) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.campus.updateMany({
          where: { id: campusId, tenantId },
          data,
        });
      } catch {}
    }

    const campus = await this.findById(tenantId, campusId);
    Object.assign(campus, data, { updatedAt: new Date() });
    this.prisma.memoryStore.campuses.set(campusId, campus);
    return campus;
  }
}
