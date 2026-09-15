import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return Array.from(this.prisma.memoryStore.parents.values()).filter(
      (p) => p.tenantId === tenantId,
    );
  }

  async findById(tenantId: string, parentId: string) {
    const parent = this.prisma.memoryStore.parents.get(parentId);
    if (!parent || parent.tenantId !== tenantId) {
      throw new NotFoundException('Parent record not found');
    }
    return parent;
  }

  async create(tenantId: string, data: any) {
    const id = `par_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const firstName = data.firstName || data.fullName?.split(' ')[0] || 'Parent';
    const lastName = data.lastName || data.fullName?.split(' ').slice(1).join(' ') || '';
    const fullName = data.fullName || `${firstName} ${lastName}`.trim();

    const parent = {
      ...data,
      id,
      tenantId,
      firstName,
      lastName,
      fullName,
      email: data.email || null,
      phone: data.phone,
      relationship: data.relationship || 'Father',
      occupation: data.occupation || null,
      address: data.address || null,
      portalAccess: data.portalAccess || 'Active',
      linkedWards: data.linkedWards || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.parents.set(id, parent);
    return parent;
  }

  async update(tenantId: string, parentId: string, data: any) {
    const parent = await this.findById(tenantId, parentId);
    Object.assign(parent, data, { updatedAt: new Date() });
    if (data.firstName || data.lastName) {
      parent.fullName = `${parent.firstName || ''} ${parent.lastName || ''}`.trim();
    }
    this.prisma.memoryStore.parents.set(parentId, parent);
    return parent;
  }

  async delete(tenantId: string, parentId: string) {
    await this.findById(tenantId, parentId);
    this.prisma.memoryStore.parents.delete(parentId);
    return { success: true, message: 'Parent record removed successfully' };
  }
}
