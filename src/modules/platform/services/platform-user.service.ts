import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import {
  CreatePlatformUserDto,
  UpdatePlatformUserStatusDto,
  UpdatePlatformUserPermissionsDto,
  UpdatePlatformUserRoleDto,
  ResetPlatformUserPasswordDto,
  PlatformUserFilterDto,
} from '../dto/platform-user.dto.js';
import { SystemPermissions, PlatformRoles } from '../../../common/constants/permissions.js';

@Injectable()
export class PlatformUserService {
  private readonly logger = new Logger(PlatformUserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private getDefaultPermissions(role: 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT' | string): string[] {
    if (role === 'PLATFORM_ADMIN') {
      return [
        SystemPermissions.PLATFORM_ADMIN,
        SystemPermissions.PLATFORM_TENANT_VIEW,
        SystemPermissions.PLATFORM_TENANT_CREATE,
        SystemPermissions.PLATFORM_TENANT_UPDATE,
        SystemPermissions.PLATFORM_TENANT_SUSPEND,
        SystemPermissions.PLATFORM_USER_VIEW,
        SystemPermissions.PLATFORM_AUDIT_VIEW,
        SystemPermissions.PLATFORM_SETTINGS_VIEW,
        SystemPermissions.IMPERSONATE_USER,
        SystemPermissions.PLATFORM_IMPERSONATION_START,
      ];
    }
    // PLATFORM_SUPPORT default permissions
    return [
      SystemPermissions.PLATFORM_TENANT_VIEW,
      SystemPermissions.PLATFORM_USER_VIEW,
      SystemPermissions.PLATFORM_AUDIT_VIEW,
      SystemPermissions.IMPERSONATE_USER,
      SystemPermissions.PLATFORM_IMPERSONATION_START,
    ];
  }

  async persistUserPermissions(userId: string, roleName: string, permissionsList: string[]) {
    try {
      // 1. Find or create Role for platform user
      const roleIdentifier = `PLATFORM_ROLE_${userId}`;
      let role = await this.prisma.role.findFirst({
        where: { name: roleIdentifier, tenantId: null },
      });

      if (!role) {
        role = await this.prisma.role.create({
          data: {
            id: `rol_plat_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
            name: roleIdentifier,
            description: `Assigned permissions for platform user ${userId}`,
            isSystem: false,
            tenantId: null,
          },
        });
      }

      // 2. Ensure UserRole link exists
      const existingUserRole = await this.prisma.userRole.findFirst({
        where: { userId, roleId: role.id },
      });

      if (!existingUserRole) {
        await this.prisma.userRole.create({
          data: {
            id: `ur_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
            userId,
            roleId: role.id,
          },
        });
      }

      // 3. Delete existing RolePermissions
      await this.prisma.rolePermission.deleteMany({
        where: { roleId: role.id },
      });

      // 4. Resolve permission IDs from database Permission table
      if (permissionsList && permissionsList.length > 0) {
        const matchingPermissions = await this.prisma.permission.findMany({
          where: { name: { in: permissionsList } },
        });

        if (matchingPermissions.length > 0) {
          await this.prisma.rolePermission.createMany({
            data: matchingPermissions.map((p) => ({
              id: `rp_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
              roleId: role.id,
              permissionId: p.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not persist platform user permissions in PostgreSQL: ${err.message}`);
    }
  }

  async createPlatformUser(actorUser: any, dto: CreatePlatformUserDto) {
    const actorRole = actorUser?.role || (actorUser?.roles && actorUser.roles[0]);

    if ((dto.role as string) === PlatformRoles.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot create Super Administrator accounts through standard platform user creation.');
    }

    if (actorRole === PlatformRoles.PLATFORM_ADMIN) {
      if ((dto.role as string) !== PlatformRoles.PLATFORM_SUPPORT) {
        throw new ForbiddenException('Platform Administrators may only provision Platform Support staff.');
      }
    } else if (actorRole !== PlatformRoles.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Administrators or authorized Platform Administrators can provision platform staff.');
    }

    if (actorRole === PlatformRoles.PLATFORM_ADMIN && dto.permissions && dto.permissions.length > 0) {
      const actorPerms: string[] = actorUser?.permissionIds || actorUser?.permissions || [];
      const unauthorizedPerms = dto.permissions.filter((p) => !actorPerms.includes(p));
      if (unauthorizedPerms.length > 0) {
        throw new ForbiddenException(`Cannot grant permissions you do not possess: ${unauthorizedPerms.join(', ')}`);
      }
    }

    const normalizedEmail = dto.email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, tenantId: null },
    });

    if (existingUser) {
      throw new ConflictException('A platform user with this email address already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const userId = `usr_plat_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const permissions = dto.permissions && dto.permissions.length > 0
      ? dto.permissions
      : this.getDefaultPermissions(dto.role);

    const createdUser = await this.prisma.user.create({
      data: {
        id: userId,
        tenantId: null,
        email: normalizedEmail,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        isActive: true,
        isPlatformAdmin: true,
        platformRole: dto.role,
      },
    });

    await this.persistUserPermissions(userId, dto.role, permissions);

    await this.auditService.log({
      tenantId: null,
      actorUserId: actorUser?.id || 'superadmin_system',
      action: 'PLATFORM_USER_CREATED',
      resourceType: 'PlatformUser',
      resourceId: userId,
      afterData: { email: normalizedEmail, role: dto.role, permissions },
    });

    return {
      id: createdUser.id,
      tenantId: null,
      email: createdUser.email,
      firstName: createdUser.firstName,
      lastName: createdUser.lastName,
      phone: null,
      avatarUrl: null,
      isActive: createdUser.isActive,
      isPlatformAdmin: true,
      platformRole: dto.role,
      role: dto.role,
      roles: [dto.role],
      permissions,
      permissionIds: permissions,
      campusIds: [],
      createdAt: createdUser.createdAt,
      updatedAt: createdUser.updatedAt,
    };
  }

  async listPlatformUsers(filter: PlatformUserFilterDto) {
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { tenantId: null },
          { isPlatformAdmin: true },
        ],
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enrichedUsers = await Promise.all(
      users.map(async (u) => {
        const uRole = u.platformRole || (u.isPlatformAdmin ? 'PLATFORM_ADMIN' : 'PLATFORM_SUPPORT');
        let perms: string[] = [];

        if (uRole === PlatformRoles.SUPER_ADMIN) {
          perms = Object.values(SystemPermissions);
        } else {
          perms = (u.userRoles || []).flatMap((ur: any) =>
            (ur.role?.permissions || []).map((rp: any) => rp.permission?.name).filter(Boolean),
          );

          if (perms.length === 0 && u.id) {
            const defaultPerms = this.getDefaultPermissions(uRole);
            await this.persistUserPermissions(u.id, uRole, defaultPerms);
            perms = defaultPerms;
          }
        }

        const { passwordHash: _, userRoles: __, ...safeUser } = u;
        return {
          ...safeUser,
          permissions: perms,
          permissionIds: perms,
          role: uRole,
          platformRole: uRole,
        };
      }),
    );

    let filtered = enrichedUsers;

    if (filter.search) {
      const q = filter.search.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.email?.toLowerCase().includes(q) ||
          u.firstName?.toLowerCase().includes(q) ||
          u.lastName?.toLowerCase().includes(q),
      );
    }

    if (filter.role) {
      filtered = filtered.filter((u) => (u.platformRole || u.role) === filter.role);
    }

    if (filter.isActive !== undefined) {
      filtered = filtered.filter((u) => u.isActive === filter.isActive);
    }

    return filtered;
  }

  async getPlatformUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user || (user.tenantId !== null && !user.isPlatformAdmin)) {
      throw new NotFoundException(`Platform user with ID '${userId}' not found.`);
    }

    const uRole = user.platformRole || (user.isPlatformAdmin ? 'PLATFORM_ADMIN' : 'PLATFORM_SUPPORT');
    let perms: string[] = [];

    if (uRole === PlatformRoles.SUPER_ADMIN) {
      perms = Object.values(SystemPermissions);
    } else {
      perms = (user.userRoles || []).flatMap((ur: any) =>
        (ur.role?.permissions || []).map((rp: any) => rp.permission?.name).filter(Boolean),
      );

      if (perms.length === 0 && user.id) {
        const defaultPerms = this.getDefaultPermissions(uRole);
        await this.persistUserPermissions(user.id, uRole, defaultPerms);
        perms = defaultPerms;
      }
    }

    const { passwordHash: _, userRoles: __, ...safeUser } = user;
    return {
      ...safeUser,
      permissions: perms,
      permissionIds: perms,
      role: uRole,
      platformRole: uRole,
    };
  }

  async updateStatus(actorUser: any, userId: string, dto: UpdatePlatformUserStatusDto) {
    const actorRole = actorUser?.role || (actorUser?.roles && actorUser.roles[0]);
    const user = await this.getPlatformUser(userId);
    const userRole = user.platformRole || user.role;

    if (userRole === PlatformRoles.SUPER_ADMIN && !dto.isActive) {
      throw new BadRequestException('Super Administrator accounts cannot be deactivated.');
    }

    if (actorRole === PlatformRoles.PLATFORM_ADMIN) {
      if (actorUser?.id === userId) {
        throw new ForbiddenException('Platform Administrators cannot activate or deactivate their own account.');
      }
      if (userRole === PlatformRoles.PLATFORM_ADMIN) {
        throw new ForbiddenException('Platform Administrators cannot activate or deactivate another Platform Administrator.');
      }
      if (userRole !== PlatformRoles.PLATFORM_SUPPORT) {
        throw new ForbiddenException('Platform Administrators may only activate or deactivate Platform Support staff.');
      }
    } else if (actorRole !== PlatformRoles.SUPER_ADMIN) {
      throw new ForbiddenException('Insufficient privileges to modify platform staff status.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: dto.isActive },
    });

    await this.auditService.log({
      tenantId: null,
      actorUserId: actorUser?.id || 'superadmin_system',
      action: dto.isActive ? 'PLATFORM_USER_ACTIVATED' : 'PLATFORM_USER_DEACTIVATED',
      resourceType: 'PlatformUser',
      resourceId: userId,
      beforeData: { isActive: user.isActive },
      afterData: { isActive: dto.isActive, reason: dto.reason },
    });

    return {
      ...user,
      isActive: updatedUser.isActive,
      updatedAt: updatedUser.updatedAt,
    };
  }

  async updatePermissions(actorUser: any, userId: string, dto: UpdatePlatformUserPermissionsDto) {
    const actorRole = actorUser?.role || (actorUser?.roles && actorUser.roles[0]);

    if (actorUser?.id === userId && actorRole !== PlatformRoles.SUPER_ADMIN) {
      throw new ForbiddenException('Platform administrators cannot modify their own assigned permissions.');
    }

    const user = await this.getPlatformUser(userId);
    const userRole = user.platformRole || user.role;

    if (userRole === PlatformRoles.SUPER_ADMIN) {
      throw new BadRequestException('Super Administrator permissions are immutable.');
    }

    if (actorRole === PlatformRoles.PLATFORM_ADMIN) {
      if (userRole === PlatformRoles.PLATFORM_ADMIN) {
        throw new ForbiddenException('Platform Administrators cannot modify the permissions of another Platform Administrator.');
      }
      if (userRole !== PlatformRoles.PLATFORM_SUPPORT) {
        throw new ForbiddenException('Platform Administrators may only modify permissions for Platform Support staff.');
      }
      const actorPerms: string[] = actorUser?.permissionIds || actorUser?.permissions || [];
      const unauthorizedPerms = dto.permissions.filter((p) => !actorPerms.includes(p));
      if (unauthorizedPerms.length > 0) {
        throw new ForbiddenException(`Cannot assign permissions you do not possess: ${unauthorizedPerms.join(', ')}`);
      }
    } else if (actorRole !== PlatformRoles.SUPER_ADMIN) {
      throw new ForbiddenException('Insufficient privileges to modify platform staff permissions.');
    }

    await this.persistUserPermissions(userId, userRole, dto.permissions);

    await this.auditService.log({
      tenantId: null,
      actorUserId: actorUser?.id || 'superadmin_system',
      action: 'PLATFORM_USER_PERMISSIONS_UPDATED',
      resourceType: 'PlatformUser',
      resourceId: userId,
      beforeData: { permissions: user.permissions || user.permissionIds },
      afterData: { permissions: dto.permissions },
    });

    return {
      ...user,
      permissionIds: dto.permissions,
      permissions: dto.permissions,
      updatedAt: new Date(),
    };
  }

  async updateRole(actorUser: any, userId: string, dto: UpdatePlatformUserRoleDto) {
    const actorRole = actorUser?.role || (actorUser?.roles && actorUser.roles[0]);

    if (actorRole !== PlatformRoles.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Administrators can change platform staff roles.');
    }

    if ((dto.role as string) === PlatformRoles.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot promote platform accounts to Super Administrator.');
    }

    const user = await this.getPlatformUser(userId);
    const currentRole = user.platformRole || user.role;

    if (currentRole === PlatformRoles.SUPER_ADMIN) {
      throw new BadRequestException('Super Administrator role cannot be modified.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { platformRole: dto.role },
    });

    await this.auditService.log({
      tenantId: null,
      actorUserId: actorUser?.id || 'superadmin_system',
      action: 'PLATFORM_USER_ROLE_UPDATED',
      resourceType: 'PlatformUser',
      resourceId: userId,
      beforeData: { role: currentRole },
      afterData: { role: dto.role },
    });

    return {
      ...user,
      platformRole: dto.role,
      role: dto.role,
      roles: [dto.role],
      updatedAt: updatedUser.updatedAt,
    };
  }

  async resetPassword(actorUser: any, userId: string, dto: ResetPlatformUserPasswordDto) {
    const actorRole = actorUser?.role || (actorUser?.roles && actorUser.roles[0]);

    const user = await this.getPlatformUser(userId);
    const userRole = user.platformRole || user.role;

    if (actorRole === PlatformRoles.PLATFORM_ADMIN) {
      if (userRole !== PlatformRoles.PLATFORM_SUPPORT) {
        throw new ForbiddenException('Platform Administrators can only reset passwords for Platform Support staff.');
      }
    } else if (actorRole !== PlatformRoles.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Administrators can reset platform staff passwords.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.auditService.log({
      tenantId: null,
      actorUserId: actorUser?.id || 'superadmin_system',
      action: 'PLATFORM_USER_PASSWORD_RESET',
      resourceType: 'PlatformUser',
      resourceId: userId,
      afterData: { email: user.email },
    });

    return { message: `Password for ${user.email} successfully updated.` };
  }
}
