import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(tenantId: string) {
    const users = Array.from(this.prisma.memoryStore.users.values()).filter(
      (u) => u.tenantId === tenantId,
    );
    return users.map((u) => {
      const { passwordHash: _hash, ...safe } = u;
      return safe;
    });
  }

  async getUser(tenantId: string, id: string) {
    const user = this.prisma.memoryStore.users.get(id);
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User not found in this school');
    }
    const { passwordHash: _hash, ...safeUser } = user;
    return safeUser;
  }

  async createUser(tenantId: string, data: any) {
    const email = data.email.toLowerCase().trim();
    const existing = Array.from(this.prisma.memoryStore.users.values()).find(
      (u) => u.tenantId === tenantId && u.email === email,
    );
    if (existing) {
      throw new ConflictException('User already exists in this school');
    }

    const id = `user_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const passwordHash = await bcrypt.hash(data.password || 'Password123!', 10);

    const newUser = {
      id,
      tenantId,
      email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      isActive: true,
      isPlatformAdmin: false,
      roles: data.roles || ['Teacher'],
      permissionIds: data.permissionIds || ['students.view', 'attendance.mark'],
      campusIds: data.campusIds || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.users.set(id, newUser);
    const { passwordHash: _pwd, ...safeUser } = newUser;
    return safeUser;
  }

  async updateUserRoles(tenantId: string, id: string, roles: string[], permissionIds?: string[]) {
    await this.getUser(tenantId, id);
    const full = this.prisma.memoryStore.users.get(id);
    full.roles = roles;
    if (permissionIds) {
      full.permissionIds = permissionIds;
    }
    full.updatedAt = new Date();
    this.prisma.memoryStore.users.set(id, full);
    const { passwordHash: _, ...safe } = full;
    return safe;
  }
}
