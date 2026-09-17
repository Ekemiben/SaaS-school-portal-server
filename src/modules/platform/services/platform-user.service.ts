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

  private getDefaultPermissions(role: 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT'): string[] {
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

  async createPlatformUser(actorUser: any, dto: CreatePlatformUserDto) {
    const actorRole = actorUser?.role || (actorUser?.roles && actorUser.roles[0]);

    // Only SUPER_ADMIN can create platform users
    if (actorRole !== PlatformRoles.SUPER_ADMIN && !actorUser?.isPlatformAdmin) {
      throw new ForbiddenException('Only Super Administrators can create platform administrators or support users.');
    }

    // Explicitly prohibit creating a SUPER_ADMIN via this endpoint
    if ((dto.role as string) === PlatformRoles.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot create Super Administrator accounts through standard platform user creation.');
    }

    const normalizedEmail = dto.email.toLowerCase().trim();

    // Check email uniqueness among platform users (where tenantId is NULL)
    let existingUser: any = null;
    if (this.prisma.isDbConnected) {
      try {
        existingUser = await this.prisma.user.findFirst({
          where: { email: normalizedEmail, tenantId: null },
        });
      } catch {
        existingUser = null;
      }
    }

    if (!existingUser) {
      existingUser = Array.from(this.prisma.memoryStore.users.values()).find(
        (u) => (u.tenantId === null || u.tenantId === undefined) && u.email === normalizedEmail,
      );
    }

    if (existingUser) {
      throw new ConflictException('A platform user with this email address already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const userId = `usr_plat_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const permissions = dto.permissions && dto.permissions.length > 0
      ? dto.permissions
      : this.getDefaultPermissions(dto.role);

    const newUser = {
      id: userId,
      tenantId: null,
      email: normalizedEmail,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: null,
      avatarUrl: null,
      isActive: true,
      isPlatformAdmin: true,
      platformRole: dto.role,
      role: dto.role,
      roles: [dto.role],
      permissionIds: permissions,
      permissions,
      campusIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.user.create({
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
      } catch (err: any) {
        this.logger.warn(`Could not persist platform user to DB directly, using memory fallback: ${err.message}`);
      }
    }

    this.prisma.memoryStore.users.set(userId, newUser);

    // Audit log
    await this.auditService.log({
      tenantId: null,
      actorUserId: actorUser?.id || 'superadmin_system',
      action: 'PLATFORM_USER_CREATED',
      resourceType: 'PlatformUser',
      resourceId: userId,
      afterData: { email: normalizedEmail, role: dto.role, permissions },
    });

    const { passwordHash: _, ...safeUser } = newUser;
    return safeUser;
  }

  async listPlatformUsers(filter: PlatformUserFilterDto) {
    let users: any[] = [];
    if (this.prisma.isDbConnected) {
      try {
        users = await this.prisma.user.findMany({
          where: { tenantId: null },
        });
      } catch {
        users = [];
      }
    }

    if (users.length === 0) {
      users = Array.from(this.prisma.memoryStore.users.values()).filter(
        (u) => u.tenantId === null || u.tenantId === undefined || u.isPlatformAdmin,
      );
    }

    if (filter.search) {
      const q = filter.search.toLowerCase();
      users = users.filter(
        (u) =>
          u.email?.toLowerCase().includes(q) ||
          u.firstName?.toLowerCase().includes(q) ||
          u.lastName?.toLowerCase().includes(q),
      );
    }

    if (filter.role) {
      users = users.filter((u) => (u.platformRole || u.role) === filter.role);
    }

    if (filter.isActive !== undefined) {
      users = users.filter((u) => u.isActive === filter.isActive);
    }

    return users.map(({ passwordHash, ...safeUser }) => safeUser);
  }

  async getPlatformUser(userId: string) {
    let user: any = null;
    if (this.prisma.isDbConnected) {
      try {
        user = await this.prisma.user.findUnique({ where: { id: userId } });
      } catch {
        user = null;
      }
    }

    if (!user) {
      user = this.prisma.memoryStore.users.get(userId);
    }

    if (!user || (user.tenantId !== null && user.tenantId !== undefined && !user.isPlatformAdmin)) {
      throw new NotFoundException(`Platform user with ID '${userId}' not found.`);
    }

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  async updateStatus(actorUser: any, userId: string, dto: UpdatePlatformUserStatusDto) {
    const user = await this.getPlatformUser(userId);
    const userRole = user.platformRole || user.role;

    // Prevent deactivating root SUPER_ADMIN
    if (userRole === PlatformRoles.SUPER_ADMIN && !dto.isActive) {
      throw new BadRequestException('Super Administrator accounts cannot be deactivated.');
    }

    const updated = {
      ...user,
      isActive: dto.isActive,
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { isActive: dto.isActive },
        });
      } catch (err: any) {
        this.logger.warn(`Could not update platform user in DB: ${err.message}`);
      }
    }

    this.prisma.memoryStore.users.set(userId, updated);

    await this.auditService.log({
      tenantId: null,
      actorUserId: actorUser?.id || 'superadmin_system',
      action: dto.isActive ? 'PLATFORM_USER_ACTIVATED' : 'PLATFORM_USER_DEACTIVATED',
      resourceType: 'PlatformUser',
      resourceId: userId,
      beforeData: { isActive: user.isActive },
      afterData: { isActive: dto.isActive, reason: dto.reason },
    });

    return updated;
  }

  async updatePermissions(actorUser: any, userId: string, dto: UpdatePlatformUserPermissionsDto) {
    const actorRole = actorUser?.role || (actorUser?.roles && actorUser.roles[0]);

    // Self modification protection: Platform support / platform admin cannot modify their own permissions
    if (actorUser?.id === userId && actorRole !== PlatformRoles.SUPER_ADMIN) {
      throw new ForbiddenException('Platform administrators cannot modify their own assigned permissions.');
    }

    const user = await this.getPlatformUser(userId);
    const userRole = user.platformRole || user.role;

    // SUPER_ADMIN permissions are immutable and complete
    if (userRole === PlatformRoles.SUPER_ADMIN) {
      throw new BadRequestException('Super Administrator permissions are immutable.');
    }

    const updated = {
      ...user,
      permissionIds: dto.permissions,
      permissions: dto.permissions,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.users.set(userId, updated);

    await this.auditService.log({
      tenantId: null,
      actorUserId: actorUser?.id || 'superadmin_system',
      action: 'PLATFORM_USER_PERMISSIONS_UPDATED',
      resourceType: 'PlatformUser',
      resourceId: userId,
      beforeData: { permissions: user.permissions || user.permissionIds },
      afterData: { permissions: dto.permissions },
    });

    return updated;
  }

  async updateRole(actorUser: any, userId: string, dto: UpdatePlatformUserRoleDto) {
    const actorRole = actorUser?.role || (actorUser?.roles && actorUser.roles[0]);

    if (actorRole !== PlatformRoles.SUPER_ADMIN && !actorUser?.isPlatformAdmin) {
      throw new ForbiddenException('Only Super Administrators can change platform roles.');
    }

    if ((dto.role as string) === PlatformRoles.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot promote platform accounts to Super Administrator.');
    }

    const user = await this.getPlatformUser(userId);
    const currentRole = user.platformRole || user.role;

    if (currentRole === PlatformRoles.SUPER_ADMIN) {
      throw new BadRequestException('Super Administrator role cannot be modified.');
    }

    const updated = {
      ...user,
      platformRole: dto.role,
      role: dto.role,
      roles: [dto.role],
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { platformRole: dto.role },
        });
      } catch (err: any) {
        this.logger.warn(`Could not update platform role in DB: ${err.message}`);
      }
    }

    this.prisma.memoryStore.users.set(userId, updated);

    await this.auditService.log({
      tenantId: null,
      actorUserId: actorUser?.id || 'superadmin_system',
      action: 'PLATFORM_USER_ROLE_UPDATED',
      resourceType: 'PlatformUser',
      resourceId: userId,
      beforeData: { role: currentRole },
      afterData: { role: dto.role },
    });

    return updated;
  }
}
