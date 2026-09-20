import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class TeachersService {
  private readonly logger = new Logger(TeachersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, campusId?: string) {
    if (this.prisma.isDbConnected) {
      try {
        const where: any = { tenantId };
        if (campusId) where.campusId = campusId;

        const teachers = await this.prisma.teacher.findMany({
          where,
          include: { campus: true, classes: true },
          orderBy: { createdAt: 'desc' },
        });

        const items = teachers.map((t) => ({
          id: t.id,
          tenantId: t.tenantId,
          campusId: t.campusId,
          campus: t.campus?.name || 'Main Campus',
          employeeNumber: t.employeeNumber,
          employeeId: t.employeeNumber,
          firstName: t.firstName,
          lastName: t.lastName,
          fullName: `${t.firstName} ${t.lastName}`.trim(),
          email: t.email,
          phone: t.phone,
          department: t.specialization || 'General',
          role: 'Subject Teacher',
          specialization: t.specialization,
          qualification: t.qualification,
          dateJoined: t.joiningDate,
          status: t.isActive ? 'Active' : 'Inactive',
          isActive: t.isActive,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));

        for (const item of items) {
          this.prisma.memoryStore.teachers.set(item.id, item);
        }

        return items;
      } catch (err: any) {
        this.logger.warn(`Failed querying teachers from DB, falling back to memoryStore: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.teachers.values()).filter(
      (t) => t.tenantId === tenantId && (!campusId || t.campusId === campusId),
    );
  }

  async findById(tenantId: string, teacherId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const t = await this.prisma.teacher.findFirst({
          where: { id: teacherId, tenantId },
          include: { campus: true, classes: true },
        });
        if (t) {
          return {
            id: t.id,
            tenantId: t.tenantId,
            campusId: t.campusId,
            campus: t.campus?.name || 'Main Campus',
            employeeNumber: t.employeeNumber,
            employeeId: t.employeeNumber,
            firstName: t.firstName,
            lastName: t.lastName,
            fullName: `${t.firstName} ${t.lastName}`.trim(),
            email: t.email,
            phone: t.phone,
            department: t.specialization || 'General',
            role: 'Subject Teacher',
            specialization: t.specialization,
            qualification: t.qualification,
            dateJoined: t.joiningDate,
            status: t.isActive ? 'Active' : 'Inactive',
            isActive: t.isActive,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Failed querying teacher by id from DB: ${err.message}`);
      }
    }

    const teacher = this.prisma.memoryStore.teachers.get(teacherId);
    if (!teacher || teacher.tenantId !== tenantId) {
      throw new NotFoundException('Teacher not found in this school');
    }
    return teacher;
  }

  async create(tenantId: string, data: any) {
    if (this.prisma.isDbConnected) {
      try {
        // 1. Resolve campusId
        let campusId = data.campusId;
        if (campusId) {
          const campusExists = await this.prisma.campus.findFirst({
            where: { id: campusId, tenantId },
          });
          if (!campusExists) campusId = undefined;
        }

        if (!campusId) {
          const mainCampus = (await this.prisma.campus.findFirst({
            where: { tenantId, isMain: true },
          })) || (await this.prisma.campus.findFirst({
            where: { tenantId },
          }));
          if (mainCampus) {
            campusId = mainCampus.id;
          } else {
            const newCampus = await this.prisma.campus.create({
              data: {
                id: `cmp_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
                tenantId,
                name: 'Main Campus',
                code: 'MAIN-01',
                isMain: true,
              },
            });
            campusId = newCampus.id;
          }
        }

        // 2. Resolve name
        const firstName = (data.firstName || data.fullName?.split(' ')[0] || 'Teacher').trim();
        const lastName = (data.lastName || data.fullName?.split(' ').slice(1).join(' ') || 'Staff').trim();

        // 3. Resolve employeeNumber
        let employeeNumber = (data.employeeNumber || data.employeeId || '').trim();
        if (!employeeNumber) {
          employeeNumber = `EMP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
        }
        const existingEmp = await this.prisma.teacher.findUnique({
          where: { tenantId_employeeNumber: { tenantId, employeeNumber } },
        });
        if (existingEmp) {
          employeeNumber = `${employeeNumber}-${Math.floor(100 + Math.random() * 900)}`;
        }

        // 4. Resolve status
        const isActive =
          data.isActive !== undefined
            ? Boolean(data.isActive)
            : data.status
            ? data.status.toLowerCase() === 'active'
            : true;

        // 5. Phone sanitization
        const phoneClean = data.phone ? data.phone.replace(/\s+/g, '') : null;

        const id = `tch_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

        const created = await this.prisma.teacher.create({
          data: {
            id,
            tenantId,
            campusId,
            employeeNumber,
            firstName,
            lastName,
            email: (data.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@school.edu`).toLowerCase().trim(),
            phone: phoneClean,
            specialization: data.specialization || data.department || null,
            qualification: data.qualification || null,
            joiningDate: data.dateJoined ? new Date(data.dateJoined) : new Date(),
            isActive,
          },
          include: { campus: true },
        });

        const formatted = {
          id: created.id,
          tenantId: created.tenantId,
          campusId: created.campusId,
          campus: created.campus?.name || 'Main Campus',
          employeeNumber: created.employeeNumber,
          employeeId: created.employeeNumber,
          firstName: created.firstName,
          lastName: created.lastName,
          fullName: `${created.firstName} ${created.lastName}`.trim(),
          email: created.email,
          phone: created.phone,
          department: data.department || created.specialization || 'General',
          role: data.role || 'Subject Teacher',
          specialization: created.specialization,
          qualification: created.qualification,
          dateJoined: created.joiningDate,
          status: created.isActive ? 'Active' : 'Inactive',
          isActive: created.isActive,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };

        this.prisma.memoryStore.teachers.set(created.id, formatted);
        return formatted;
      } catch (err: any) {
        this.logger.error(`Failed persisting teacher to PostgreSQL: ${err.message}`, err.stack);
        throw err;
      }
    }

    // Fallback in-memory
    const id = `tch_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const firstName = data.firstName || data.fullName?.split(' ')[0] || 'Teacher';
    const lastName = data.lastName || data.fullName?.split(' ').slice(1).join(' ') || '';
    const fullName = data.fullName || `${firstName} ${lastName}`.trim();
    const teacher = {
      ...data,
      id,
      tenantId,
      campusId: data.campusId || 'campus_main_01',
      employeeNumber:
        data.employeeNumber ||
        data.employeeId ||
        `EMP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      employeeId:
        data.employeeId ||
        data.employeeNumber ||
        `EMP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      firstName,
      lastName,
      fullName,
      email: data.email,
      phone: data.phone || null,
      department: data.department || 'Sciences',
      role: data.role || 'Subject Teacher',
      specialization: data.specialization || null,
      qualification: data.qualification || null,
      status: data.status || 'Active',
      isActive: data.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.teachers.set(id, teacher);
    return teacher;
  }

  async update(tenantId: string, teacherId: string, data: any) {
    if (this.prisma.isDbConnected) {
      try {
        const existing = await this.prisma.teacher.findFirst({
          where: { id: teacherId, tenantId },
        });
        if (!existing) {
          throw new NotFoundException('Teacher not found in this school');
        }

        const updateData: any = {};
        if (data.firstName) updateData.firstName = data.firstName.trim();
        if (data.lastName) updateData.lastName = data.lastName.trim();
        if (data.fullName && !data.firstName && !data.lastName) {
          const parts = data.fullName.trim().split(' ');
          updateData.firstName = parts[0];
          updateData.lastName = parts.slice(1).join(' ') || 'Staff';
        }
        if (data.email) updateData.email = data.email.toLowerCase().trim();
        if (data.phone !== undefined) updateData.phone = data.phone ? data.phone.replace(/\s+/g, '') : null;
        if (data.specialization !== undefined) updateData.specialization = data.specialization;
        if (data.department !== undefined && !data.specialization) updateData.specialization = data.department;
        if (data.qualification !== undefined) updateData.qualification = data.qualification;
        if (data.dateJoined) updateData.joiningDate = new Date(data.dateJoined);
        if (data.status !== undefined) updateData.isActive = data.status.toLowerCase() === 'active';
        if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);

        const updated = await this.prisma.teacher.update({
          where: { id: teacherId },
          data: updateData,
          include: { campus: true },
        });

        const formatted = {
          id: updated.id,
          tenantId: updated.tenantId,
          campusId: updated.campusId,
          campus: updated.campus?.name || 'Main Campus',
          employeeNumber: updated.employeeNumber,
          employeeId: updated.employeeNumber,
          firstName: updated.firstName,
          lastName: updated.lastName,
          fullName: `${updated.firstName} ${updated.lastName}`.trim(),
          email: updated.email,
          phone: updated.phone,
          department: data.department || updated.specialization || 'General',
          role: data.role || 'Subject Teacher',
          specialization: updated.specialization,
          qualification: updated.qualification,
          dateJoined: updated.joiningDate,
          status: updated.isActive ? 'Active' : 'Inactive',
          isActive: updated.isActive,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };

        this.prisma.memoryStore.teachers.set(teacherId, formatted);
        return formatted;
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Failed updating teacher in DB: ${err.message}`);
      }
    }

    const teacher = await this.findById(tenantId, teacherId);
    Object.assign(teacher, data, { updatedAt: new Date() });
    if (data.firstName || data.lastName) {
      teacher.fullName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
    }
    this.prisma.memoryStore.teachers.set(teacherId, teacher);
    return teacher;
  }

  async delete(tenantId: string, teacherId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const existing = await this.prisma.teacher.findFirst({
          where: { id: teacherId, tenantId },
        });
        if (!existing) {
          throw new NotFoundException('Teacher not found in this school');
        }

        await this.prisma.teacher.delete({
          where: { id: teacherId },
        });

        this.prisma.memoryStore.teachers.delete(teacherId);
        return { success: true, message: 'Teacher record removed successfully' };
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Failed deleting teacher from DB: ${err.message}`);
      }
    }

    await this.findById(tenantId, teacherId);
    this.prisma.memoryStore.teachers.delete(teacherId);
    return { success: true, message: 'Teacher record removed successfully' };
  }
}
