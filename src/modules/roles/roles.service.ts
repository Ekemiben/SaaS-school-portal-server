import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SystemPermissions, STANDARD_SCHOOL_ROLES } from '../../common/constants/permissions.js';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listRoles(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required to list roles.');
    }

    let roles = await this.prisma.role.findMany({
      where: { tenantId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // If no roles exist for this tenant, automatically bootstrap the 14 standard roles
    if (roles.length === 0) {
      await this.seedDefaultRolesForTenant(tenantId);
      roles = await this.prisma.role.findMany({
        where: { tenantId },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
          _count: {
            select: {
              userRoles: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    return roles.map((r) => {
      const matchedStandard = STANDARD_SCHOOL_ROLES.find(
        (sr) => sr.name.toLowerCase() === r.name.toLowerCase(),
      );
      return {
        id: r.id,
        name: r.name,
        code: matchedStandard?.code || r.name.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        description: r.description || matchedStandard?.description || '',
        level: matchedStandard?.level || 10,
        isSystem: r.isSystem,
        usersAssigned: r._count?.userRoles || 0,
        usersCount: r._count?.userRoles || 0,
        permissions: r.permissions.map((p) => p.permission.name),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });
  }

  async seedDefaultRolesForTenant(tenantId: string) {
    this.logger.log(`Auto-seeding 14 standard school roles for tenant: ${tenantId}`);

    for (const standardRole of STANDARD_SCHOOL_ROLES) {
      let role = await this.prisma.role.findFirst({
        where: { tenantId, name: standardRole.name },
      });

      if (!role) {
        role = await this.prisma.role.create({
          data: {
            tenantId,
            name: standardRole.name,
            description: standardRole.description,
            isSystem: standardRole.code === 'SCHOOL_OWNER',
          },
        });
      }

      for (const permName of standardRole.permissions) {
        let perm = await this.prisma.permission.findUnique({
          where: { name: permName },
        });

        if (!perm) {
          perm = await this.prisma.permission.create({
            data: {
              name: permName,
              module: permName.split('.')[0] || 'general',
              description: `System permission for ${permName}`,
            },
          });
        }

        const existingLink = await this.prisma.rolePermission.findUnique({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: perm.id,
            },
          },
        });

        if (!existingLink) {
          await this.prisma.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId: perm.id,
            },
          });
        }
      }
    }
  }

  async createRole(
    tenantId: string,
    dto: { name: string; description?: string; permissions: string[] },
  ) {
    const existing = await this.prisma.role.findFirst({
      where: { tenantId, name: dto.name.trim() },
    });
    if (existing) {
      throw new BadRequestException(`Role with name "${dto.name}" already exists in this school.`);
    }

    const role = await this.prisma.role.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim() || '',
        isSystem: false,
      },
    });

    if (dto.permissions && dto.permissions.length > 0) {
      for (const permName of dto.permissions) {
        let perm = await this.prisma.permission.findUnique({
          where: { name: permName },
        });
        if (!perm) {
          perm = await this.prisma.permission.create({
            data: {
              name: permName,
              module: permName.split('.')[0] || 'general',
              description: `Permission for ${permName}`,
            },
          });
        }
        await this.prisma.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: perm.id,
          },
        });
      }
    }

    return {
      id: role.id,
      name: role.name,
      code: role.name.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
      description: role.description || '',
      isSystem: role.isSystem,
      usersAssigned: 0,
      permissions: dto.permissions || [],
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async updateRole(
    tenantId: string,
    roleId: string,
    dto: { name?: string; description?: string; permissions?: string[] },
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
      include: { _count: { select: { userRoles: true } } },
    });
    if (!role) {
      throw new NotFoundException('Role not found or does not belong to this school.');
    }

    // Platform-level global roles cannot be modified by a tenant
    if (role.isSystem && !role.tenantId) {
      throw new BadRequestException('Platform-level default roles cannot be modified.');
    }

    // Update role metadata
    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
      },
    });

    // Update permissions matrix
    if (dto.permissions !== undefined) {
      await this.prisma.rolePermission.deleteMany({
        where: { roleId },
      });

      for (const permName of dto.permissions) {
        let perm = await this.prisma.permission.findUnique({
          where: { name: permName },
        });
        if (!perm) {
          perm = await this.prisma.permission.create({
            data: {
              name: permName,
              module: permName.split('.')[0] || 'general',
              description: `Permission for ${permName}`,
            },
          });
        }
        await this.prisma.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: perm.id,
          },
        });
      }
    }

    const matchedStandard = STANDARD_SCHOOL_ROLES.find(
      (sr) => sr.name.toLowerCase() === updated.name.toLowerCase(),
    );

    return {
      id: updated.id,
      name: updated.name,
      code: matchedStandard?.code || updated.name.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
      description: updated.description || '',
      level: matchedStandard?.level || 10,
      isSystem: updated.isSystem,
      usersAssigned: role._count?.userRoles || 0,
      permissions: dto.permissions !== undefined ? dto.permissions : [],
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteRole(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
      include: {
        _count: {
          select: { userRoles: true },
        },
      },
    });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    if (role.name === 'School Owner' || (role.isSystem && !role.tenantId)) {
      throw new BadRequestException('The primary School Owner / System governance role cannot be deleted.');
    }

    if (role._count.userRoles > 0) {
      throw new BadRequestException(
        `Cannot delete role "${role.name}" because it is currently assigned to ${role._count.userRoles} user account(s). Reassign those users first.`,
      );
    }

    // Delete role permissions links first
    await this.prisma.rolePermission.deleteMany({
      where: { roleId },
    });

    await this.prisma.role.delete({
      where: { id: roleId },
    });

    return { success: true, message: `Role "${role.name}" deleted successfully.` };
  }

  async listPermissions() {
    return Object.entries(SystemPermissions).map(([key, value]) => ({
      key,
      permission: value,
      module: value.split('.')[0],
    }));
  }
}
