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
    const parent = {
      id,
      tenantId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone,
      relationship: data.relationship || 'Parent',
      occupation: data.occupation || null,
      address: data.address || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.parents.set(id, parent);
    return parent;
  }
}
