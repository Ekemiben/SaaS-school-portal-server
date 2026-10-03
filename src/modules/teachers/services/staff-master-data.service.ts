import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class StaffMasterDataService {
  private readonly logger = new Logger(StaffMasterDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // DEPARTMENTS
  // ==========================================

  async listDepartments(tenantId: string) {
    if (this.prisma.isDbConnected) {
      try {
        return await this.prisma.department.findMany({
          where: { tenantId },
          include: {
            headStaff: {
              select: { id: true, firstName: true, lastName: true, employeeNumber: true, email: true },
            },
            _count: { select: { staff: true } },
          },
          orderBy: { name: 'asc' },
        });
      } catch (err: any) {
        this.logger.warn(`Failed querying departments from DB: ${err.message}`);
      }
    }

    const items = Array.from((this.prisma.memoryStore as any).departments?.values() || [])
      .filter((d: any) => d.tenantId === tenantId);
    return items;
  }

  async getDepartmentById(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      const dept = await this.prisma.department.findFirst({
        where: { id, tenantId },
        include: {
          headStaff: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true, email: true },
          },
          staff: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true, email: true },
          },
        },
      });
      if (!dept) throw new NotFoundException(`Department "${id}" not found in this school organization.`);
      return dept;
    }

    const dept = (this.prisma.memoryStore as any).departments?.get(id);
    if (!dept || dept.tenantId !== tenantId) {
      throw new NotFoundException(`Department not found in this school organization.`);
    }
    return dept;
  }

  async createDepartment(
    tenantId: string,
    data: { name: string; code?: string; description?: string; headStaffId?: string },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Department name is required.');
    const code = (data.code || name.substring(0, 4).toUpperCase()).trim();

    if (this.prisma.isDbConnected) {
      // 1. Uniqueness check within tenant
      const existing = await this.prisma.department.findFirst({
        where: {
          tenantId,
          OR: [{ name: { equals: name, mode: 'insensitive' } }, { code: { equals: code, mode: 'insensitive' } }],
        },
      });
      if (existing) {
        throw new ConflictException(`A department with name "${name}" or code "${code}" already exists.`);
      }

      // 2. Head Staff Tenant Integrity check
      if (data.headStaffId) {
        const headStaff =
          (this.prisma.staff?.findFirst ? await this.prisma.staff.findFirst({ where: { id: data.headStaffId, tenantId } }) : null) ||
          (this.prisma.teacher?.findFirst ? await this.prisma.teacher.findFirst({ where: { id: data.headStaffId, tenantId } }) : null);
        if (!headStaff) {
          throw new ForbiddenException('Referenced head educator does not belong to this school organization.');
        }
      }

      const id = `dept_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      return await this.prisma.department.create({
        data: {
          id,
          tenantId,
          name,
          code,
          description: data.description?.trim() || null,
          headStaffId: data.headStaffId || null,
        },
        include: {
          headStaff: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          },
        },
      });
    }

    // In-memory fallback
    const id = `dept_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const dept = {
      id,
      tenantId,
      name,
      code,
      description: data.description || null,
      headStaffId: data.headStaffId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (!(this.prisma.memoryStore as any).departments) {
      (this.prisma.memoryStore as any).departments = new Map();
    }
    (this.prisma.memoryStore as any).departments.set(id, dept);
    return dept;
  }

  async updateDepartment(
    tenantId: string,
    id: string,
    data: { name?: string; code?: string; description?: string; headStaffId?: string | null },
  ) {
    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.department.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException(`Department "${id}" not found.`);

      if (data.name || data.code) {
        const duplicate = await this.prisma.department.findFirst({
          where: {
            tenantId,
            id: { not: id },
            OR: [
              ...(data.name ? [{ name: { equals: data.name.trim(), mode: 'insensitive' as const } }] : []),
              ...(data.code ? [{ code: { equals: data.code.trim(), mode: 'insensitive' as const } }] : []),
            ],
          },
        });
        if (duplicate) {
          throw new ConflictException(`Another department with this name or code already exists.`);
        }
      }

      if (data.headStaffId) {
        const headStaff =
          (this.prisma.staff?.findFirst ? await this.prisma.staff.findFirst({ where: { id: data.headStaffId, tenantId } }) : null) ||
          (this.prisma.teacher?.findFirst ? await this.prisma.teacher.findFirst({ where: { id: data.headStaffId, tenantId } }) : null);
        if (!headStaff) {
          throw new ForbiddenException('Referenced head educator does not belong to this school organization.');
        }
      }

      return await this.prisma.department.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name.trim() }),
          ...(data.code && { code: data.code.trim() }),
          ...(data.description !== undefined && { description: data.description?.trim() || null }),
          ...(data.headStaffId !== undefined && { headStaffId: data.headStaffId }),
        },
        include: {
          headStaff: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          },
        },
      });
    }

    const dept = (this.prisma.memoryStore as any).departments?.get(id);
    if (!dept || dept.tenantId !== tenantId) throw new NotFoundException('Department not found.');
    Object.assign(dept, data, { updatedAt: new Date() });
    return dept;
  }

  async deleteDepartment(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.department.findFirst({
        where: { id, tenantId },
        include: { _count: { select: { staff: true } } },
      });
      if (!existing) throw new NotFoundException(`Department "${id}" not found.`);

      // SetNull on any staff referencing this department before removal
      await this.prisma.teacher.updateMany({
        where: { departmentId: id, tenantId },
        data: { departmentId: null },
      });

      await this.prisma.department.delete({ where: { id } });
      return { success: true, message: `Department "${existing.name}" removed successfully.` };
    }

    (this.prisma.memoryStore as any).departments?.delete(id);
    return { success: true, message: 'Department removed successfully.' };
  }

  // ==========================================
  // DESIGNATIONS
  // ==========================================

  async listDesignations(tenantId: string) {
    if (this.prisma.isDbConnected) {
      try {
        return await this.prisma.designation.findMany({
          where: { tenantId },
          include: { _count: { select: { staff: true } } },
          orderBy: [{ level: 'asc' }, { name: 'asc' }],
        });
      } catch (err: any) {
        this.logger.warn(`Failed querying designations from DB: ${err.message}`);
      }
    }

    const items = Array.from((this.prisma.memoryStore as any).designations?.values() || [])
      .filter((d: any) => d.tenantId === tenantId);
    return items;
  }

  async getDesignationById(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      const desig = await this.prisma.designation.findFirst({
        where: { id, tenantId },
        include: {
          staff: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true, email: true },
          },
        },
      });
      if (!desig) throw new NotFoundException(`Designation "${id}" not found.`);
      return desig;
    }

    const desig = (this.prisma.memoryStore as any).designations?.get(id);
    if (!desig || desig.tenantId !== tenantId) throw new NotFoundException('Designation not found.');
    return desig;
  }

  async createDesignation(
    tenantId: string,
    data: { name: string; code?: string; description?: string; level?: number },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Designation title is required.');
    const code = (data.code || name.substring(0, 4).toUpperCase()).trim();

    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.designation.findFirst({
        where: {
          tenantId,
          OR: [{ name: { equals: name, mode: 'insensitive' } }, { code: { equals: code, mode: 'insensitive' } }],
        },
      });
      if (existing) {
        throw new ConflictException(`A designation with name "${name}" or code "${code}" already exists.`);
      }

      const id = `desig_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      return await this.prisma.designation.create({
        data: {
          id,
          tenantId,
          name,
          code,
          description: data.description?.trim() || null,
          level: data.level ? Number(data.level) : 1,
        },
      });
    }

    const id = `desig_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const desig = {
      id,
      tenantId,
      name,
      code,
      description: data.description || null,
      level: data.level || 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (!(this.prisma.memoryStore as any).designations) {
      (this.prisma.memoryStore as any).designations = new Map();
    }
    (this.prisma.memoryStore as any).designations.set(id, desig);
    return desig;
  }

  async updateDesignation(
    tenantId: string,
    id: string,
    data: { name?: string; code?: string; description?: string; level?: number },
  ) {
    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.designation.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException(`Designation "${id}" not found.`);

      if (data.name || data.code) {
        const duplicate = await this.prisma.designation.findFirst({
          where: {
            tenantId,
            id: { not: id },
            OR: [
              ...(data.name ? [{ name: { equals: data.name.trim(), mode: 'insensitive' as const } }] : []),
              ...(data.code ? [{ code: { equals: data.code.trim(), mode: 'insensitive' as const } }] : []),
            ],
          },
        });
        if (duplicate) {
          throw new ConflictException(`Another designation with this name or code already exists.`);
        }
      }

      return await this.prisma.designation.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name.trim() }),
          ...(data.code && { code: data.code.trim() }),
          ...(data.description !== undefined && { description: data.description?.trim() || null }),
          ...(data.level !== undefined && { level: Number(data.level) }),
        },
      });
    }

    const desig = (this.prisma.memoryStore as any).designations?.get(id);
    if (!desig || desig.tenantId !== tenantId) throw new NotFoundException('Designation not found.');
    Object.assign(desig, data, { updatedAt: new Date() });
    return desig;
  }

  async deleteDesignation(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.designation.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException(`Designation "${id}" not found.`);

      await this.prisma.teacher.updateMany({
        where: { designationId: id, tenantId },
        data: { designationId: null },
      });

      await this.prisma.designation.delete({ where: { id } });
      return { success: true, message: `Designation "${existing.name}" removed successfully.` };
    }

    (this.prisma.memoryStore as any).designations?.delete(id);
    return { success: true, message: 'Designation removed successfully.' };
  }

  // ==========================================
  // STAFF ROOMS / OFFICE LOCATIONS
  // ==========================================

  async listStaffRooms(tenantId: string, campusId?: string) {
    if (this.prisma.isDbConnected) {
      try {
        return await this.prisma.staffRoom.findMany({
          where: {
            tenantId,
            ...(campusId && {
              OR: [{ campusId }, { campusId: null }],
            }),
          },
          include: {
            campus: { select: { id: true, name: true, code: true } },
            _count: { select: { staff: true } },
          },
          orderBy: { name: 'asc' },
        });
      } catch (err: any) {
        this.logger.warn(`Failed querying staff rooms from DB: ${err.message}`);
      }
    }

    const items = Array.from((this.prisma.memoryStore as any).staffRooms?.values() || [])
      .filter((r: any) => r.tenantId === tenantId && (!campusId || !r.campusId || r.campusId === campusId));
    return items;
  }

  async getStaffRoomById(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      const room = await this.prisma.staffRoom.findFirst({
        where: { id, tenantId },
        include: {
          campus: { select: { id: true, name: true, code: true } },
          staff: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true, email: true },
          },
        },
      });
      if (!room) throw new NotFoundException(`Staff room "${id}" not found.`);
      return room;
    }

    const room = (this.prisma.memoryStore as any).staffRooms?.get(id);
    if (!room || room.tenantId !== tenantId) throw new NotFoundException('Staff room not found.');
    return room;
  }

  async createStaffRoom(
    tenantId: string,
    data: { name: string; campusId?: string; building?: string; roomNumber?: string; capacity?: number },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Staff room / office name is required.');

    if (this.prisma.isDbConnected) {
      // 1. Campus Tenant Integrity Check
      let campusId = data.campusId?.trim() || null;
      if (campusId) {
        const campus = await this.prisma.campus.findFirst({
          where: { id: campusId, tenantId },
        });
        if (!campus) {
          throw new ForbiddenException('Referenced campus does not belong to this school organization.');
        }
      }

      // 2. Uniqueness check
      const existing = await this.prisma.staffRoom.findFirst({
        where: { tenantId, name: { equals: name, mode: 'insensitive' } },
      });
      if (existing) {
        throw new ConflictException(`A staff room or office with name "${name}" already exists.`);
      }

      const id = `room_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      return await this.prisma.staffRoom.create({
        data: {
          id,
          tenantId,
          campusId,
          name,
          building: data.building?.trim() || null,
          roomNumber: data.roomNumber?.trim() || null,
          capacity: data.capacity ? Number(data.capacity) : 10,
        },
        include: {
          campus: { select: { id: true, name: true, code: true } },
        },
      });
    }

    const id = `room_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const room = {
      id,
      tenantId,
      campusId: data.campusId || null,
      name,
      building: data.building || null,
      roomNumber: data.roomNumber || null,
      capacity: data.capacity || 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (!(this.prisma.memoryStore as any).staffRooms) {
      (this.prisma.memoryStore as any).staffRooms = new Map();
    }
    (this.prisma.memoryStore as any).staffRooms.set(id, room);
    return room;
  }

  async updateStaffRoom(
    tenantId: string,
    id: string,
    data: { name?: string; campusId?: string | null; building?: string; roomNumber?: string; capacity?: number },
  ) {
    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.staffRoom.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException(`Staff room "${id}" not found.`);

      if (data.name) {
        const duplicate = await this.prisma.staffRoom.findFirst({
          where: {
            tenantId,
            id: { not: id },
            name: { equals: data.name.trim(), mode: 'insensitive' },
          },
        });
        if (duplicate) {
          throw new ConflictException(`Another staff room with name "${data.name.trim()}" already exists.`);
        }
      }

      if (data.campusId) {
        const campus = await this.prisma.campus.findFirst({
          where: { id: data.campusId, tenantId },
        });
        if (!campus) {
          throw new ForbiddenException('Referenced campus does not belong to this school organization.');
        }
      }

      return await this.prisma.staffRoom.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name.trim() }),
          ...(data.campusId !== undefined && { campusId: data.campusId }),
          ...(data.building !== undefined && { building: data.building?.trim() || null }),
          ...(data.roomNumber !== undefined && { roomNumber: data.roomNumber?.trim() || null }),
          ...(data.capacity !== undefined && { capacity: Number(data.capacity) }),
        },
        include: {
          campus: { select: { id: true, name: true, code: true } },
        },
      });
    }

    const room = (this.prisma.memoryStore as any).staffRooms?.get(id);
    if (!room || room.tenantId !== tenantId) throw new NotFoundException('Staff room not found.');
    Object.assign(room, data, { updatedAt: new Date() });
    return room;
  }

  async deleteStaffRoom(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.staffRoom.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException(`Staff room "${id}" not found.`);

      await this.prisma.teacher.updateMany({
        where: { staffRoomId: id, tenantId },
        data: { staffRoomId: null },
      });

      await this.prisma.staffRoom.delete({ where: { id } });
      return { success: true, message: `Staff room "${existing.name}" removed successfully.` };
    }

    (this.prisma.memoryStore as any).staffRooms?.delete(id);
    return { success: true, message: 'Staff room removed successfully.' };
  }
}
