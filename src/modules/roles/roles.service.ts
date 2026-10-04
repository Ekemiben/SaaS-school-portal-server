import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(tenantId: string) {
    const roles = await this.prisma.role.findMany({
      where: {
        OR: [
          { tenantId },
          { isSystem: true },
          { tenantId: null },
        ],
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description || '',
      isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permission.name),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createRole(
    tenantId: string,
    dto: { name: string; description?: string; permissions: string[] },
  ) {
    const existing = await this.prisma.role.findFirst({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(`Role with name "${dto.name}" already exists in this school.`);
    }

    const role = await this.prisma.role.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description || '',
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
      description: role.description || '',
      isSystem: role.isSystem,
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
    });
    if (!role) {
      throw new NotFoundException('Role not found or cannot be modified.');
    }
    if (role.isSystem) {
      throw new BadRequestException('System-defined default roles cannot be modified.');
    }

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });

    if (dto.permissions) {
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

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description || '',
      isSystem: updated.isSystem,
      permissions: dto.permissions || [],
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteRole(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
    });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }
    if (role.isSystem) {
      throw new BadRequestException('System-defined default roles cannot be deleted.');
    }

    await this.prisma.role.delete({
      where: { id: roleId },
    });
    return { success: true, message: 'Custom role deleted successfully.' };
  }

  async listPermissions() {
    return Object.entries(SystemPermissions).map(([key, value]) => ({
      key,
      permission: value,
      module: value.split('.')[0],
    }));
  }
}
