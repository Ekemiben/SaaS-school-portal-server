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
    const departments = await this.prisma.department.findMany({
      where: { tenantId },
      include: {
        headStaff: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true, email: true },
        },
        _count: { select: { staff: true, legacyTeachers: true } },
      },
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      departments.map(async (dept) => {
        if (!dept.headStaff && dept.headStaffId) {
          const teacherHead = await this.prisma.teacher.findFirst({
            where: { id: dept.headStaffId, tenantId },
            select: { id: true, firstName: true, lastName: true, employeeNumber: true, email: true },
          });
          if (teacherHead) {
            return { ...dept, headStaff: teacherHead };
          }
        }
        return dept;
      }),
    );
  }


  async getDepartmentById(tenantId: string, id: string) {
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

  async createDepartment(
    tenantId: string,
    data: { name: string; code?: string; description?: string; headStaffId?: string },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Department name is required.');
    const code = (data.code || name.substring(0, 4).toUpperCase()).trim();

    const existing = await this.prisma.department.findFirst({
      where: {
        tenantId,
        OR: [{ name: { equals: name, mode: 'insensitive' } }, { code: { equals: code, mode: 'insensitive' } }],
      },
    });
    if (existing) {
      throw new ConflictException(`A department with name "${name}" or code "${code}" already exists.`);
    }

    if (data.headStaffId) {
      const headStaff =
        (await this.prisma.staff?.findFirst?.({ where: { id: data.headStaffId, tenantId } })) ||
        (await this.prisma.teacher.findFirst({ where: { id: data.headStaffId, tenantId } }));
      if (!headStaff) {
        throw new ForbiddenException('Referenced head educator does not belong to this school organization.');
      }
    }

    const id = `dept_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    return this.prisma.department.create({
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

  async updateDepartment(
    tenantId: string,
    id: string,
    data: { name?: string; code?: string; description?: string; headStaffId?: string | null },
  ) {
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
        (await this.prisma.staff?.findFirst?.({ where: { id: data.headStaffId, tenantId } })) ||
        (await this.prisma.teacher.findFirst({ where: { id: data.headStaffId, tenantId } }));
      if (!headStaff) {
        throw new ForbiddenException('Referenced head educator does not belong to this school organization.');
      }
    }

    return this.prisma.department.update({
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

  async deleteDepartment(tenantId: string, id: string) {
    const existing = await this.prisma.department.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException(`Department "${id}" not found.`);

    if (this.prisma.staff?.updateMany) {
      await this.prisma.staff.updateMany({
        where: { departmentId: id, tenantId },
        data: { departmentId: null },
      });
    }

    await this.prisma.teacher.updateMany({
      where: { departmentId: id, tenantId },
      data: { departmentId: null },
    });

    await this.prisma.department.delete({ where: { id } });
    return { success: true, message: `Department "${existing.name}" removed successfully.` };
  }

  // ==========================================
  // DESIGNATIONS
  // ==========================================

  async listDesignations(tenantId: string) {
    return this.prisma.designation.findMany({
      where: { tenantId },
      include: { _count: { select: { staff: true, legacyTeachers: true } } },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  async getDesignationById(tenantId: string, id: string) {
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

  async createDesignation(
    tenantId: string,
    data: { name: string; code?: string; description?: string; level?: number },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Designation title is required.');
    const code = (data.code || name.substring(0, 4).toUpperCase()).trim();

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
    return this.prisma.designation.create({
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

  async updateDesignation(
    tenantId: string,
    id: string,
    data: { name?: string; code?: string; description?: string; level?: number },
  ) {
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

    return this.prisma.designation.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.code && { code: data.code.trim() }),
        ...(data.description !== undefined && { description: data.description?.trim() || null }),
        ...(data.level !== undefined && { level: Number(data.level) }),
      },
    });
  }

  async deleteDesignation(tenantId: string, id: string) {
    const existing = await this.prisma.designation.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Designation "${id}" not found.`);

    if (this.prisma.staff?.updateMany) {
      await this.prisma.staff.updateMany({
        where: { designationId: id, tenantId },
        data: { designationId: null },
      });
    }

    await this.prisma.teacher.updateMany({
      where: { designationId: id, tenantId },
      data: { designationId: null },
    });

    await this.prisma.designation.delete({ where: { id } });
    return { success: true, message: `Designation "${existing.name}" removed successfully.` };
  }

  // ==========================================
  // STAFF ROOMS / OFFICE LOCATIONS
  // ==========================================

  async listStaffRooms(tenantId: string, campusId?: string) {
    return this.prisma.staffRoom.findMany({
      where: {
        tenantId,
        ...(campusId && {
          OR: [{ campusId }, { campusId: null }],
        }),
      },
      include: {
        campus: { select: { id: true, name: true, code: true } },
        _count: { select: { staff: true, legacyTeachers: true } },
      },
      orderBy: { name: 'asc' },
    });
  }


  async getStaffRoomById(tenantId: string, id: string) {
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

  async createStaffRoom(
    tenantId: string,
    data: { name: string; campusId?: string; building?: string; roomNumber?: string; capacity?: number },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Staff room / office name is required.');

    let campusId = data.campusId?.trim() || null;
    if (campusId) {
      const campus = await this.prisma.campus.findFirst({
        where: { id: campusId, tenantId },
      });
      if (!campus) {
        throw new ForbiddenException('Referenced campus does not belong to this school organization.');
      }
    }

    const existing = await this.prisma.staffRoom.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException(`A staff room or office with name "${name}" already exists.`);
    }

    const id = `room_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    return this.prisma.staffRoom.create({
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

  async updateStaffRoom(
    tenantId: string,
    id: string,
    data: { name?: string; campusId?: string | null; building?: string; roomNumber?: string; capacity?: number },
  ) {
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

    return this.prisma.staffRoom.update({
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

  async deleteStaffRoom(tenantId: string, id: string) {
    const existing = await this.prisma.staffRoom.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Staff room "${id}" not found.`);

    if (this.prisma.staff?.updateMany) {
      await this.prisma.staff.updateMany({
        where: { staffRoomId: id, tenantId },
        data: { staffRoomId: null },
      });
    }

    await this.prisma.teacher.updateMany({
      where: { staffRoomId: id, tenantId },
      data: { staffRoomId: null },
    });

    await this.prisma.staffRoom.delete({ where: { id } });
    return { success: true, message: `Staff room "${existing.name}" removed successfully.` };
  }
}
