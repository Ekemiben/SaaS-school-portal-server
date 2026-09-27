import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enforces the tenant's commercial staff quota limits (maxStaff).
   */
  async enforceStaffQuota(tenantId: string, countToAdd: number = 1): Promise<void> {
    let maxStaff = 30; // Default starter limit

    if (this.prisma.isDbConnected) {
      const sub = await this.prisma.subscription.findFirst({
        where: { tenantId },
      });
      if (sub && typeof sub.maxStaff === 'number') {
        maxStaff = sub.maxStaff;
      }
    } else {
      const memSub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
        (s: any) => s.tenantId === tenantId,
      ) as any;
      if (memSub && typeof memSub.maxStaff === 'number') {
        maxStaff = memSub.maxStaff;
      }
    }

    // Unlimited quota check
    if (maxStaff >= 90000) {
      return;
    }

    let currentStaff = 0;
    if (this.prisma.isDbConnected) {
      const teacherCount = await this.prisma.teacher.count({
        where: { tenantId, isActive: true },
      });
      const staffUserCount = await this.prisma.user.count({
        where: {
          tenantId,
          isActive: true,
          userRoles: {
            some: {
              role: {
                name: {
                  in: ['Admin', 'Staff', 'Principal', 'Accountant', 'Librarian', 'Teacher'],
                },
              },
            },
          },
        },
      });
      currentStaff = Math.max(teacherCount, staffUserCount);
    } else {
      const memTeachers = Array.from(this.prisma.memoryStore.teachers.values()).filter(
        (t: any) => t.tenantId === tenantId,
      ).length;
      const memUsers = Array.from(this.prisma.memoryStore.users.values()).filter(
        (u: any) =>
          u.tenantId === tenantId &&
          (u.roles || []).some((r: string) => {
            const rl = r.toLowerCase();
            return !rl.includes('student') && !rl.includes('parent');
          }),
      ).length;
      currentStaff = Math.max(memTeachers, memUsers);
    }

    if (currentStaff + countToAdd > maxStaff) {
      throw new BadRequestException(
        `Staff hiring quota reached (${currentStaff}/${maxStaff}). Please upgrade your subscription plan to add more staff.`,
      );
    }
  }

  async listUsers(tenantId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const dbUsers = await this.prisma.user.findMany({
          where: { tenantId },
          include: {
            userRoles: { include: { role: true } },
            userCampuses: true,
          },
        });
        if (dbUsers && dbUsers.length > 0) {
          return dbUsers.map((u) => {
            const { passwordHash: _hash, userRoles, userCampuses, ...rest } = u;
            return {
              ...rest,
              roles: userRoles.map((ur) => ur.role?.name).filter(Boolean),
              campusIds: userCampuses.map((uc) => uc.campusId),
            };
          });
        }
      } catch {
        // Fallback to memoryStore
      }
    }

    const users = Array.from(this.prisma.memoryStore.users.values()).filter(
      (u) => u.tenantId === tenantId,
    );
    return users.map((u) => {
      const { passwordHash: _hash, ...safe } = u;
      return safe;
    });
  }

  async getUser(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      try {
        const dbUser = await this.prisma.user.findFirst({
          where: { id, tenantId },
          include: {
            userRoles: { include: { role: true } },
            userCampuses: true,
          },
        });
        if (dbUser) {
          const { passwordHash: _hash, userRoles, userCampuses, ...rest } = dbUser;
          return {
            ...rest,
            roles: userRoles.map((ur) => ur.role?.name).filter(Boolean),
            campusIds: userCampuses.map((uc) => uc.campusId),
          };
        }
      } catch {
        // Fallback to memoryStore
      }
    }

    const user = this.prisma.memoryStore.users.get(id);
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User not found in this school');
    }
    const { passwordHash: _hash, ...safeUser } = user;
    return safeUser;
  }

  async createUser(tenantId: string, data: any) {
    const email = data.email.toLowerCase().trim();

    // Determine if user has a staff role
    const userRoles = Array.isArray(data.roles) && data.roles.length > 0 ? data.roles : ['Teacher'];
    const isStaff = userRoles.some((r: string) => {
      const rl = r.toLowerCase();
      return !rl.includes('student') && !rl.includes('parent');
    });

    // Enforce Staff Quota
    if (isStaff) {
      await this.enforceStaffQuota(tenantId, 1);
    }

    // Check memoryStore for existing user
    const existingMem = Array.from(this.prisma.memoryStore.users.values()).find(
      (u) => u.tenantId === tenantId && u.email === email,
    );
    if (existingMem) {
      throw new ConflictException('User already exists in this school');
    }

    const id = `user_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const passwordHash = await bcrypt.hash(data.password || randomBytes(16).toString('hex'), 10);

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
      roles: userRoles,
      permissionIds: data.permissionIds || ['students.view', 'attendance.mark'],
      campusIds: data.campusIds || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected) {
      try {
        const existingInDb = await this.prisma.user.findFirst({
          where: { tenantId, email },
        });
        if (existingInDb) {
          throw new ConflictException('User already exists in this school');
        }

        const roleName = userRoles[0] || 'Teacher';
        let role = await this.prisma.role.findFirst({
          where: {
            OR: [
              { tenantId, name: roleName },
              { tenantId: null, name: roleName },
            ],
          },
        });
        if (!role) {
          role = await this.prisma.role.create({
            data: {
              tenantId,
              name: roleName,
              description: `${roleName} Role`,
              isSystem: true,
            },
          });
        }

        await this.prisma.user.create({
          data: {
            id,
            tenantId,
            email,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone || null,
            isActive: true,
            isPlatformAdmin: false,
            userRoles: {
              create: {
                roleId: role.id,
              },
            },
          },
        });
      } catch (err: any) {
        if (err instanceof ConflictException) throw err;
      }
    }

    this.prisma.memoryStore.users.set(id, newUser);
    const { passwordHash: _pwd, ...safeUser } = newUser;
    return safeUser;
  }

  async updateUserRoles(tenantId: string, id: string, roles: string[], permissionIds?: string[]) {
    await this.getUser(tenantId, id);
    const full = this.prisma.memoryStore.users.get(id);
    if (full) {
      full.roles = roles;
      if (permissionIds) {
        full.permissionIds = permissionIds;
      }
      full.updatedAt = new Date();
      this.prisma.memoryStore.users.set(id, full);
    }
    const { passwordHash: _, ...safe } = full || {};
    return safe;
  }
}
