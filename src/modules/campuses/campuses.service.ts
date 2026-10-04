import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class CampusesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.campus.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: {
            students: true,
            teachers: true,
            classes: true,
          },
        },
      },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findById(tenantId: string, campusId: string) {
    const campus = await this.prisma.campus.findFirst({
      where: { id: campusId, tenantId },
      include: {
        _count: {
          select: {
            students: true,
            teachers: true,
            classes: true,
          },
        },
      },
    });
    if (!campus) throw new NotFoundException('Campus not found in this school');
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
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });
    const maxCampuses = sub?.maxCampuses ?? 1;
    const currentCount = await this.prisma.campus.count({ where: { tenantId } });
    if (currentCount >= maxCampuses) {
      throw new ForbiddenException(
        `Campus limit reached for your subscription tier (${currentCount}/${maxCampuses}). Please upgrade your plan to add more campuses.`
      );
    }

    const existingDb = await this.prisma.campus.findFirst({
      where: { tenantId, code: data.code.toUpperCase() },
    });
    if (existingDb) {
      throw new ConflictException(`Campus code "${data.code}" already exists in this school.`);
    }

    if (data.isMain) {
      await this.prisma.campus.updateMany({
        where: { tenantId, isMain: true },
        data: { isMain: false },
      });
    }

    return this.prisma.campus.create({
      data: {
        tenantId,
        name: data.name.trim(),
        code: data.code.toUpperCase().trim(),
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country || 'Nigeria',
        phone: data.phone,
        email: data.email,
        isMain: !!data.isMain,
      },
    });
  }

  async update(tenantId: string, campusId: string, data: Partial<{
    name: string;
    code: string;
    address: string;
    city: string;
    state: string;
    country: string;
    phone: string;
    email: string;
    isMain: boolean;
    isActive: boolean;
  }>) {
    const existing = await this.prisma.campus.findFirst({
      where: { id: campusId, tenantId },
    });
    if (!existing) throw new NotFoundException('Campus not found in this school');

    if (data.code && data.code.toUpperCase() !== existing.code) {
      const codeConflict = await this.prisma.campus.findFirst({
        where: { tenantId, code: data.code.toUpperCase(), id: { not: campusId } },
      });
      if (codeConflict) {
        throw new ConflictException(`Campus code "${data.code}" is already in use.`);
      }
    }

    if (data.isMain) {
      await this.prisma.campus.updateMany({
        where: { tenantId, isMain: true, id: { not: campusId } },
        data: { isMain: false },
      });
    }

    return this.prisma.campus.update({
      where: { id: campusId },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.code && { code: data.code.toUpperCase().trim() }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.isMain !== undefined && { isMain: data.isMain }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async delete(tenantId: string, campusId: string) {
    const existing = await this.prisma.campus.findFirst({
      where: { id: campusId, tenantId },
      include: {
        _count: {
          select: { students: true, teachers: true, classes: true },
        },
      },
    });
    if (!existing) throw new NotFoundException('Campus not found in this school');

    if (existing.isMain) {
      throw new ForbiddenException('Cannot delete the primary/main campus.');
    }

    const { students, teachers, classes } = existing._count;
    if (students > 0 || teachers > 0 || classes > 0) {
      throw new ForbiddenException(
        `Cannot delete campus with active records (${students} students, ${teachers} teachers, ${classes} classes). Reassign or archive these records first.`
      );
    }

    await this.prisma.campus.delete({
      where: { id: campusId },
    });

    return { success: true, message: 'Campus deleted successfully' };
  }
}
