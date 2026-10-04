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

    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });
    if (sub && typeof sub.maxStaff === 'number') {
      maxStaff = sub.maxStaff;
    }

    if (maxStaff >= 90000) {
      return;
    }

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
                in: ['Admin', 'Staff', 'Principal', 'Accountant', 'Librarian', 'Teacher', 'School Admin', 'Campus Admin', 'Accountant / Bursar'],
              },
            },
          },
        },
      },
    });
    const currentStaff = Math.max(teacherCount, staffUserCount);

    if (currentStaff + countToAdd > maxStaff) {
      throw new BadRequestException(
        `Staff hiring quota reached (${currentStaff}/${maxStaff}). Please upgrade your subscription plan to add more staff.`,
      );
    }
  }

  async listUsers(tenantId: string) {
    const dbUsers = await this.prisma.user.findMany({
      where: { tenantId },
      include: {
        userRoles: { include: { role: true } },
        userCampuses: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return dbUsers.map((u) => {
      const { passwordHash: _hash, userRoles, userCampuses, ...rest } = u;
      return {
        ...rest,
        roles: userRoles.map((ur) => ur.role?.name).filter(Boolean),
        campusIds: userCampuses.map((uc) => uc.campusId),
      };
    });
  }

  async getUser(tenantId: string, id: string) {
    const dbUser = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: {
        userRoles: { include: { role: true } },
        userCampuses: true,
      },
    });

    if (!dbUser) {
      throw new NotFoundException('User not found in this school');
    }

    const { passwordHash: _hash, userRoles, userCampuses, ...rest } = dbUser;
    return {
      ...rest,
      roles: userRoles.map((ur) => ur.role?.name).filter(Boolean),
      campusIds: userCampuses.map((uc) => uc.campusId),
    };
  }

  async createUser(tenantId: string, data: any) {
    const email = data.email.toLowerCase().trim();

    const userRoles = Array.isArray(data.roles) && data.roles.length > 0 ? data.roles : ['Teacher'];
    const isStaff = userRoles.some((r: string) => {
      const rl = r.toLowerCase();
      return !rl.includes('student') && !rl.includes('parent');
    });

    if (isStaff) {
      await this.enforceStaffQuota(tenantId, 1);
    }

    const existingInDb = await this.prisma.user.findFirst({
      where: { tenantId, email },
    });
    if (existingInDb) {
      throw new ConflictException('User already exists in this school');
    }

    const id = `user_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const passwordHash = await bcrypt.hash(data.password || randomBytes(16).toString('hex'), 10);

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

    const created = await this.prisma.user.create({
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
        userCampuses: data.campusIds && data.campusIds.length > 0
          ? {
              create: data.campusIds.map((campusId: string) => ({
                campusId,
              })),
            }
          : undefined,
      },
      include: {
        userRoles: { include: { role: true } },
        userCampuses: true,
      },
    });

    const { passwordHash: _pwd, userRoles: ur, userCampuses: uc, ...safeUser } = created;
    return {
      ...safeUser,
      roles: ur.map((r) => r.role?.name).filter(Boolean),
      campusIds: uc.map((c) => c.campusId),
    };
  }

  async updateUserRoles(tenantId: string, id: string, roles: string[], permissionIds?: string[]) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: { userRoles: true },
    });
    if (!user) {
      throw new NotFoundException('User not found in this school');
    }

    await this.prisma.userRole.deleteMany({
      where: { userId: id },
    });

    for (const roleName of roles) {
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
            isSystem: false,
          },
        });
      }
      await this.prisma.userRole.create({
        data: {
          userId: id,
          roleId: role.id,
        },
      });
    }

    return this.getUser(tenantId, id);
  }
}
