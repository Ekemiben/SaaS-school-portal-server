import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class TeachersService {
  private readonly logger = new Logger(TeachersService.name);

  constructor(private readonly prisma: PrismaService) {}

  private parseSubjects(subjectsTaught?: string | null): string[] {
    if (!subjectsTaught) return [];
    try {
      if (subjectsTaught.startsWith('[')) {
        const parsed = JSON.parse(subjectsTaught);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // fallback to comma separated
    }
    return subjectsTaught.split(',').map((s) => s.trim()).filter(Boolean);
  }

  private formatTeacher(t: any, campusName?: string) {
    const assignedClass = t.classes?.[0]?.name || t.assignedClass || 'N/A';
    const assignedClassId = t.classes?.[0]?.id || null;
    const subjects = this.parseSubjects(t.subjectsTaught);

    return {
      id: t.id,
      tenantId: t.tenantId,
      campusId: t.campusId,
      campus: campusName || t.campus?.name || 'Main Campus',
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
      assignedClass,
      assignedClassId,
      subjectsTaught: subjects,
      officeLocation: t.officeLocation || '',
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

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

        const items = teachers.map((t) => this.formatTeacher(t));

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
          return this.formatTeacher(t);
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
        // Enforce staff subscription quota
        const sub = await this.prisma.subscription.findFirst({
          where: { tenantId },
        });
        const maxStaff = sub?.maxStaff ?? 30;
        const currentCount = await this.prisma.teacher.count({
          where: { tenantId, isActive: true },
        });
        if (currentCount >= maxStaff) {
          throw new ForbiddenException(
            `Staff hiring quota reached (${currentCount}/${maxStaff}). Please upgrade your subscription plan to add more staff.`
          );
        }

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

        // 6. Subjects taught normalization
        let subjectsTaughtStr: string | null = null;
        if (data.subjectsTaught) {
          if (Array.isArray(data.subjectsTaught)) {
            subjectsTaughtStr = data.subjectsTaught.map((s: any) => String(s).trim()).filter(Boolean).join(', ');
          } else if (typeof data.subjectsTaught === 'string' && data.subjectsTaught.trim()) {
            subjectsTaughtStr = data.subjectsTaught.trim();
          }
        }

        // 7. Office location normalization
        const officeLocation = data.officeLocation ? String(data.officeLocation).trim() : null;

        // 8. Assigned class normalization
        let assignedClassStr: string | null = null;
        if (data.assignedClass && data.assignedClass !== 'N/A' && String(data.assignedClass).trim()) {
          assignedClassStr = String(data.assignedClass).trim();
        }

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
            officeLocation,
            subjectsTaught: subjectsTaughtStr,
            assignedClass: assignedClassStr,
          },
          include: { campus: true },
        });

        // Relational Class linking
        let linkedClass: any = null;
        if (assignedClassStr) {
          linkedClass = await this.prisma.class.findFirst({
            where: {
              tenantId,
              OR: [
                { id: assignedClassStr },
                { name: { equals: assignedClassStr, mode: 'insensitive' } },
              ],
            },
          });
          if (linkedClass) {
            await this.prisma.class.update({
              where: { id: linkedClass.id },
              data: { classTeacherId: created.id },
            });
            if (created.assignedClass !== linkedClass.name) {
              await this.prisma.teacher.update({
                where: { id: created.id },
                data: { assignedClass: linkedClass.name },
              });
            }
          }
        }

        const createdWithClasses = {
          ...created,
          classes: linkedClass ? [linkedClass] : [],
        };
        const formatted = this.formatTeacher(createdWithClasses, created.campus?.name);

        this.prisma.memoryStore.teachers.set(created.id, formatted);
        return formatted;
      } catch (err: any) {
        this.logger.error(`Failed persisting teacher to PostgreSQL: ${err.message}`, err.stack);
        throw err;
      }
    }

    // Fallback in-memory
    const currentMemoryCount = Array.from(this.prisma.memoryStore.teachers.values()).filter(
      (t: any) => t.tenantId === tenantId && t.isActive !== false,
    ).length;
    const memorySub = this.prisma.memoryStore.subscriptions?.get(tenantId);
    const maxStaffMem = memorySub?.maxStaff ?? 30;
    if (currentMemoryCount >= maxStaffMem) {
      throw new ForbiddenException(
        `Staff hiring quota reached (${currentMemoryCount}/${maxStaffMem}). Please upgrade your subscription plan to add more staff.`
      );
    }

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
      assignedClass: data.assignedClass || 'N/A',
      subjectsTaught: Array.isArray(data.subjectsTaught)
        ? data.subjectsTaught
        : data.subjectsTaught
        ? data.subjectsTaught.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
      officeLocation: data.officeLocation || '',
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
        if (data.officeLocation !== undefined) updateData.officeLocation = data.officeLocation ? String(data.officeLocation).trim() : null;

        if (data.subjectsTaught !== undefined) {
          if (Array.isArray(data.subjectsTaught)) {
            updateData.subjectsTaught = data.subjectsTaught.map((s: any) => String(s).trim()).filter(Boolean).join(', ');
          } else if (typeof data.subjectsTaught === 'string') {
            updateData.subjectsTaught = data.subjectsTaught.trim() || null;
          } else {
            updateData.subjectsTaught = null;
          }
        }

        if (data.assignedClass !== undefined) {
          const val = data.assignedClass ? String(data.assignedClass).trim() : '';
          if (!val || val.toUpperCase() === 'N/A' || val.toLowerCase() === 'unassigned') {
            // Unassign from any class
            await this.prisma.class.updateMany({
              where: { tenantId, classTeacherId: teacherId },
              data: { classTeacherId: null },
            });
            updateData.assignedClass = null;
          } else {
            const matchedClass = await this.prisma.class.findFirst({
              where: {
                tenantId,
                OR: [
                  { id: val },
                  { name: { equals: val, mode: 'insensitive' } },
                ],
              },
            });
            if (matchedClass) {
              await this.prisma.class.updateMany({
                where: { tenantId, classTeacherId: teacherId, id: { not: matchedClass.id } },
                data: { classTeacherId: null },
              });
              await this.prisma.class.update({
                where: { id: matchedClass.id },
                data: { classTeacherId: teacherId },
              });
              updateData.assignedClass = matchedClass.name;
            } else {
              await this.prisma.class.updateMany({
                where: { tenantId, classTeacherId: teacherId },
                data: { classTeacherId: null },
              });
              updateData.assignedClass = val;
            }
          }
        }

        const updated = await this.prisma.teacher.update({
          where: { id: teacherId },
          data: updateData,
          include: { campus: true, classes: true },
        });

        const formatted = this.formatTeacher(updated);
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

        // Clear any class teacher assignments first
        await this.prisma.class.updateMany({
          where: { tenantId, classTeacherId: teacherId },
          data: { classTeacherId: null },
        });

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
