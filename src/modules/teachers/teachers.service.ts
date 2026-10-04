import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Injectable()
export class TeachersService {
  private readonly logger = new Logger(TeachersService.name);

  constructor(private readonly prisma: PrismaService) {}

  private hasFinancialPermission(user?: any): boolean {
    if (!user) return false;
    const userRole = user.role || (user.roles && user.roles[0]);
    if (userRole === 'SUPER_ADMIN' || (user.roles && user.roles.includes('SUPER_ADMIN'))) return true;
    const userRoles: string[] = user.roles || [];
    if (
      userRoles.includes('School Owner') ||
      userRoles.includes('School Admin') ||
      userRoles.includes('ADMIN') ||
      userRoles.includes('Admin')
    ) {
      return true;
    }
    const perms: string[] = user.permissionIds || user.permissions || [];
    return perms.includes('*') || perms.includes(SystemPermissions.PAYROLL_MANAGE);
  }

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
    return this.formatStaff(t, campusName);
  }

  private formatStaff(s: any, campusName?: string) {
    const isTeacher = Boolean(
      s.teacherProfile ||
      s.designation?.name?.toLowerCase().includes('teacher') ||
      s.department?.name?.toLowerCase().includes('academic'),
    );

    const departmentName = s.department?.name || s.specialization || 'General';
    const designationName = s.designation?.name || (isTeacher ? 'Subject Teacher' : 'Staff Member');
    const officeLocationName = s.staffRoom?.name || s.officeLocation || '';

    const assignedClass = s.classes?.[0]?.name || s.assignedClass || 'N/A';
    const assignedClassId = s.classes?.[0]?.id || null;

    let subjects = this.parseSubjects(s.subjectsTaught);
    if (s.classSubjects && Array.isArray(s.classSubjects) && s.classSubjects.length > 0) {
      const relSubjects = s.classSubjects.map((cs: any) => cs.subject?.name).filter(Boolean);
      if (relSubjects.length > 0) subjects = relSubjects;
    }

    return {
      id: s.id,
      tenantId: s.tenantId,
      campusId: s.campusId,
      campus: campusName || s.campus?.name || 'Main Campus',
      employeeNumber: s.employeeNumber,
      employeeId: s.employeeNumber,
      firstName: s.firstName,
      middleName: s.middleName || null,
      lastName: s.lastName,
      fullName: `${s.firstName} ${s.lastName}`.trim(),
      email: s.email,
      phone: s.phone,
      gender: s.gender || null,
      dateOfBirth: s.dateOfBirth || null,
      department: departmentName,
      departmentId: s.departmentId || null,
      role: designationName,
      designation: designationName,
      designationId: s.designationId || null,
      employmentStatus: s.employmentStatus || (s.isActive ? 'ACTIVE' : 'INACTIVE'),
      isTeachingStaff: isTeacher,
      specialization: s.teacherProfile?.specialization || s.specialization || null,
      qualification: s.teacherProfile?.qualification || s.qualification || null,
      dateJoined: s.joiningDate,
      status: s.isActive ? 'Active' : 'Inactive',
      isActive: s.isActive,
      assignedClass,
      assignedClassId,
      subjectsTaught: subjects,
      officeLocation: officeLocationName,
      staffRoomId: s.staffRoomId || null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  async findAll(tenantId: string, campusId?: string) {
    const where: any = { tenantId };
    if (campusId) where.campusId = campusId;

    if (this.prisma.staff?.findMany) {
      const staffList = await this.prisma.staff.findMany({
        where,
        include: {
          campus: true,
          department: true,
          designation: true,
          staffRoom: true,
          teacherProfile: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (staffList && staffList.length > 0) {
        return staffList.map((s) => this.formatStaff(s));
      }
    }

    const teachers = await this.prisma.teacher.findMany({
      where,
      include: {
        campus: true,
        classes: true,
        department: true,
        designation: true,
        staffRoom: true,
        classSubjects: { include: { subject: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return teachers.map((t) => this.formatTeacher(t));
  }

  async findById(tenantId: string, teacherId: string) {
    if (this.prisma.staff?.findFirst) {
      const staff = await this.prisma.staff.findFirst({
        where: { id: teacherId, tenantId },
        include: {
          campus: true,
          department: true,
          designation: true,
          staffRoom: true,
          teacherProfile: true,
        },
      });
      if (staff) {
        return this.formatStaff(staff);
      }
    }

    const t = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenantId },
      include: {
        campus: true,
        classes: true,
        department: true,
        designation: true,
        staffRoom: true,
        classSubjects: { include: { subject: true } },
      },
    });

    if (!t) {
      throw new NotFoundException('Teacher not found in this school');
    }

    return this.formatTeacher(t);
  }

  async create(tenantId: string, data: any, user?: any) {
    const hasFinancialData =
      data.basicSalary !== undefined ||
      data.housingAllowance !== undefined ||
      data.transportAllowance !== undefined ||
      data.otherAllowances !== undefined ||
      data.bankName !== undefined ||
      data.accountNumber !== undefined;

    if (hasFinancialData && !this.hasFinancialPermission(user)) {
      throw new ForbiddenException('You do not have permission to manage staff financial profiles.');
    }

    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
    });
    const maxStaff = sub?.maxStaff ?? 30;
    const currentCount = this.prisma.staff?.count
      ? await this.prisma.staff.count({ where: { tenantId, isActive: true } })
      : await this.prisma.teacher.count({ where: { tenantId, isActive: true } });
    if (currentCount >= maxStaff) {
      throw new ForbiddenException(
        `Staff hiring quota reached (${currentCount}/${maxStaff}). Please upgrade your subscription plan to add more staff.`,
      );
    }

    let campusId = data.campusId;
    if (campusId) {
      const campusExists = await this.prisma.campus.findFirst({
        where: { id: campusId, tenantId },
      });
      if (!campusExists) campusId = undefined;
    }

    if (!campusId) {
      const mainCampus =
        (await this.prisma.campus.findFirst({
          where: { tenantId, isMain: true },
        })) ||
        (await this.prisma.campus.findFirst({
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

    let departmentId = data.departmentId || null;
    if (departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: departmentId, tenantId },
      });
      if (!dept) {
        throw new ForbiddenException('Assigned department does not belong to this school organization.');
      }
    } else if (data.department && typeof data.department === 'string') {
      const dept = await this.prisma.department.findFirst({
        where: {
          tenantId,
          OR: [
            { name: { equals: data.department.trim(), mode: 'insensitive' } },
            { code: { equals: data.department.trim(), mode: 'insensitive' } },
          ],
        },
      });
      if (dept) departmentId = dept.id;
    }

    let designationId = data.designationId || null;
    let designationName = 'Staff Member';
    if (designationId) {
      const desig = await this.prisma.designation.findFirst({
        where: { id: designationId, tenantId },
      });
      if (!desig) {
        throw new ForbiddenException('Assigned designation does not belong to this school organization.');
      }
      designationName = desig.name;
    } else if ((data.designation || data.role) && typeof (data.designation || data.role) === 'string') {
      const queryRole = (data.designation || data.role).trim();
      const desig = await this.prisma.designation.findFirst({
        where: {
          tenantId,
          OR: [
            { name: { equals: queryRole, mode: 'insensitive' } },
            { code: { equals: queryRole, mode: 'insensitive' } },
          ],
        },
      });
      if (desig) {
        designationId = desig.id;
        designationName = desig.name;
      }
    }

    let staffRoomId = data.staffRoomId || null;
    if (staffRoomId) {
      const room = await this.prisma.staffRoom.findFirst({
        where: { id: staffRoomId, tenantId },
      });
      if (!room) {
        throw new ForbiddenException('Assigned staff room does not belong to this school organization.');
      }
      if (room.campusId && room.campusId !== campusId) {
        throw new BadRequestException('Assigned staff room belongs to a different school campus.');
      }
    }

    let linkedClass: any = null;
    const targetClassRef = data.assignedClassId || data.assignedClass;
    if (targetClassRef && targetClassRef !== 'N/A' && String(targetClassRef).trim()) {
      linkedClass = await this.prisma.class.findFirst({
        where: {
          tenantId,
          OR: [{ id: String(targetClassRef).trim() }, { name: { equals: String(targetClassRef).trim(), mode: 'insensitive' } }],
        },
      });
      if (linkedClass && linkedClass.campusId !== campusId) {
        throw new BadRequestException('Assigned class belongs to a different school campus.');
      }
    }

    const firstName = (data.firstName || data.fullName?.split(' ')[0] || 'Staff').trim();
    const lastName = (data.lastName || data.fullName?.split(' ').slice(1).join(' ') || 'Member').trim();

    let employeeNumber = (data.employeeNumber || data.employeeId || '').trim();
    if (!employeeNumber) {
      employeeNumber = `EMP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    }
    const existingEmp = this.prisma.staff?.findUnique
      ? await this.prisma.staff.findUnique({ where: { tenantId_employeeNumber: { tenantId, employeeNumber } } })
      : await this.prisma.teacher.findUnique({ where: { tenantId_employeeNumber: { tenantId, employeeNumber } } });
    if (existingEmp) {
      employeeNumber = `${employeeNumber}-${Math.floor(100 + Math.random() * 900)}`;
    }

    const isActive =
      data.isActive !== undefined
        ? Boolean(data.isActive)
        : data.status
        ? data.status.toLowerCase() === 'active'
        : true;

    const phoneClean = data.phone ? data.phone.replace(/\s+/g, '') : null;

    let subjectsTaughtStr: string | null = null;
    if (data.subjectsTaught) {
      if (Array.isArray(data.subjectsTaught)) {
        subjectsTaughtStr = data.subjectsTaught.map((s: any) => String(s).trim()).filter(Boolean).join(', ');
      } else if (typeof data.subjectsTaught === 'string' && data.subjectsTaught.trim()) {
        subjectsTaughtStr = data.subjectsTaught.trim();
      }
    }

    const isTeachingStaff = Boolean(
      data.isTeachingStaff ||
      linkedClass ||
      subjectsTaughtStr ||
      data.specialization ||
      data.qualification ||
      designationName.toLowerCase().includes('teacher') ||
      designationName.toLowerCase().includes('tutor') ||
      designationName.toLowerCase().includes('instructor'),
    );

    const id = `stf_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const createdResult = await this.prisma.$transaction(async (tx) => {
      let newStaff: any = null;
      if (tx.staff?.create) {
        newStaff = await tx.staff.create({
          data: {
            id,
            tenantId,
            campusId,
            employeeNumber,
            firstName,
            middleName: data.middleName || null,
            lastName,
            email: (data.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@school.edu`).toLowerCase().trim(),
            phone: phoneClean,
            gender: data.gender || null,
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
            departmentId,
            designationId,
            staffRoomId,
            employmentStatus: isActive ? 'ACTIVE' : 'ON_LEAVE',
            joiningDate: data.dateJoined ? new Date(data.dateJoined) : new Date(),
            isActive,
          },
          include: {
            campus: true,
            department: true,
            designation: true,
            staffRoom: true,
          },
        });
      }

      if (isTeachingStaff && tx.teacherProfile?.create) {
        await tx.teacherProfile.create({
          data: {
            id: `tcp_${(newStaff?.id || id).replace(/^stf_/, '')}`,
            tenantId,
            staffId: newStaff?.id || id,
            specialization: data.specialization || data.department || null,
            qualification: data.qualification || null,
          },
        });
      }

      let newTeacher: any = null;
      if (tx.teacher?.create) {
        newTeacher = await tx.teacher.create({
          data: {
            id: newStaff?.id || id,
            tenantId,
            campusId,
            employeeNumber: (newStaff || { employeeNumber }).employeeNumber,
            firstName,
            lastName,
            email: (data.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@school.edu`).toLowerCase().trim(),
            phone: phoneClean,
            departmentId,
            designationId,
            staffRoomId,
            specialization: data.specialization || data.department || null,
            qualification: data.qualification || null,
            joiningDate: data.dateJoined ? new Date(data.dateJoined) : new Date(),
            isActive,
            officeLocation: data.officeLocation ? String(data.officeLocation).trim() : null,
            subjectsTaught: subjectsTaughtStr,
            assignedClass: linkedClass ? linkedClass.name : data.assignedClass || null,
          },
          include: {
            campus: true,
            department: true,
            designation: true,
            staffRoom: true,
          },
        });
      }

      const staffRefId = (newStaff && newStaff.id) || (newTeacher && newTeacher.id) || id;

      if (linkedClass && tx.class?.update) {
        await tx.class.update({
          where: { id: linkedClass.id },
          data: { classTeacherId: staffRefId },
        });
      }

      if (
        hasFinancialData &&
        (data.basicSalary !== undefined || data.bankName || data.accountNumber) &&
        tx.staffSalaryProfile?.upsert
      ) {
        const basicSalary = data.basicSalary !== undefined ? Number(data.basicSalary) : 0;
        const housingAllowance = data.housingAllowance !== undefined ? Number(data.housingAllowance) : 0;
        const transportAllowance = data.transportAllowance !== undefined ? Number(data.transportAllowance) : 0;
        const otherAllowances = data.otherAllowances !== undefined ? Number(data.otherAllowances) : 0;

        await tx.staffSalaryProfile.upsert({
          where: { tenantId_staffUserId: { tenantId, staffUserId: staffRefId } },
          update: {
            campusId,
            basicSalary,
            housingAllowance,
            transportAllowance,
            otherAllowances,
            bankName: data.bankName?.trim() || null,
            bankCode: data.bankCode?.trim() || null,
            accountNumber: data.accountNumber?.trim() || null,
            accountName: data.accountName?.trim() || `${firstName} ${lastName}`.trim(),
            isActive: true,
          },
          create: {
            id: `ssp_${staffRefId}`,
            tenantId,
            campusId,
            staffUserId: staffRefId,
            basicSalary,
            housingAllowance,
            transportAllowance,
            otherAllowances,
            bankName: data.bankName?.trim() || null,
            bankCode: data.bankCode?.trim() || null,
            accountNumber: data.accountNumber?.trim() || null,
            accountName: data.accountName?.trim() || `${firstName} ${lastName}`.trim(),
            isActive: true,
          },
        });
      }

      return newStaff || newTeacher || { id, tenantId, campusId, firstName, lastName, employeeNumber, isActive };
    });

    const createdWithClasses = {
      ...createdResult,
      classes: linkedClass ? [linkedClass] : [],
    };
    return this.formatStaff(createdWithClasses, createdResult.campus?.name);
  }

  async update(tenantId: string, teacherId: string, data: any, user?: any) {
    const hasFinancialData =
      data.basicSalary !== undefined ||
      data.housingAllowance !== undefined ||
      data.transportAllowance !== undefined ||
      data.otherAllowances !== undefined ||
      data.bankName !== undefined ||
      data.accountNumber !== undefined;

    if (hasFinancialData && !this.hasFinancialPermission(user)) {
      throw new ForbiddenException('You do not have permission to manage staff financial profiles.');
    }

    const existing = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Teacher not found in this school');
    }

    const updateData: any = {};

    if (data.firstName || data.fullName) {
      updateData.firstName = (data.firstName || data.fullName?.split(' ')[0] || existing.firstName).trim();
    }
    if (data.lastName || data.fullName) {
      updateData.lastName = (data.lastName || data.fullName?.split(' ').slice(1).join(' ') || existing.lastName).trim();
    }
    if (data.email) updateData.email = data.email.toLowerCase().trim();
    if (data.phone !== undefined) updateData.phone = data.phone ? data.phone.replace(/\s+/g, '') : null;
    if (data.specialization !== undefined) updateData.specialization = data.specialization;
    if (data.qualification !== undefined) updateData.qualification = data.qualification;
    if (data.dateJoined) updateData.joiningDate = new Date(data.dateJoined);
    if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);
    if (data.status) updateData.isActive = data.status.toLowerCase() === 'active';
    if (data.officeLocation !== undefined) updateData.officeLocation = data.officeLocation?.trim() || null;

    if (data.departmentId !== undefined) {
      if (data.departmentId) {
        const dept = await this.prisma.department.findFirst({
          where: { id: data.departmentId, tenantId },
        });
        if (!dept) throw new ForbiddenException('Assigned department does not belong to this school organization.');
      }
      updateData.departmentId = data.departmentId || null;
    } else if (data.department && typeof data.department === 'string') {
      const dept = await this.prisma.department.findFirst({
        where: {
          tenantId,
          OR: [
            { name: { equals: data.department.trim(), mode: 'insensitive' } },
            { code: { equals: data.department.trim(), mode: 'insensitive' } },
          ],
        },
      });
      if (dept) updateData.departmentId = dept.id;
    }

    if (data.designationId !== undefined) {
      if (data.designationId) {
        const desig = await this.prisma.designation.findFirst({
          where: { id: data.designationId, tenantId },
        });
        if (!desig) throw new ForbiddenException('Assigned designation does not belong to this school organization.');
      }
      updateData.designationId = data.designationId || null;
    } else if ((data.designation || data.role) && typeof (data.designation || data.role) === 'string') {
      const queryRole = (data.designation || data.role).trim();
      const desig = await this.prisma.designation.findFirst({
        where: {
          tenantId,
          OR: [
            { name: { equals: queryRole, mode: 'insensitive' } },
            { code: { equals: queryRole, mode: 'insensitive' } },
          ],
        },
      });
      if (desig) updateData.designationId = desig.id;
    }

    if (data.staffRoomId !== undefined) {
      if (data.staffRoomId) {
        const room = await this.prisma.staffRoom.findFirst({
          where: { id: data.staffRoomId, tenantId },
        });
        if (!room) throw new ForbiddenException('Assigned staff room does not belong to this school organization.');
        if (room.campusId && room.campusId !== existing.campusId) {
          throw new BadRequestException('Assigned staff room belongs to a different school campus.');
        }
      }
      updateData.staffRoomId = data.staffRoomId || null;
    }

    if (data.subjectsTaught !== undefined) {
      if (Array.isArray(data.subjectsTaught)) {
        updateData.subjectsTaught = data.subjectsTaught.map((s: any) => String(s).trim()).filter(Boolean).join(', ');
      } else if (typeof data.subjectsTaught === 'string') {
        updateData.subjectsTaught = data.subjectsTaught.trim() || null;
      }
    }

    if (data.assignedClass !== undefined || data.assignedClassId !== undefined) {
      const val = data.assignedClassId || data.assignedClass;
      if (!val || val === 'N/A') {
        await this.prisma.class.updateMany({
          where: { tenantId, classTeacherId: teacherId },
          data: { classTeacherId: null },
        });
        updateData.assignedClass = null;
      } else {
        const matchedClass = await this.prisma.class.findFirst({
          where: {
            tenantId,
            OR: [{ id: val }, { name: { equals: val, mode: 'insensitive' } }],
          },
        });
        if (matchedClass) {
          if (matchedClass.campusId !== existing.campusId) {
            throw new BadRequestException('Assigned class belongs to a different school campus.');
          }
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.teacher.update({
        where: { id: teacherId },
        data: updateData,
        include: {
          campus: true,
          classes: true,
          department: true,
          designation: true,
          staffRoom: true,
          classSubjects: { include: { subject: true } },
        },
      });

      if (hasFinancialData) {
        const basicSalary = data.basicSalary !== undefined ? Number(data.basicSalary) : 0;
        const housingAllowance = data.housingAllowance !== undefined ? Number(data.housingAllowance) : 0;
        const transportAllowance = data.transportAllowance !== undefined ? Number(data.transportAllowance) : 0;
        const otherAllowances = data.otherAllowances !== undefined ? Number(data.otherAllowances) : 0;

        await tx.staffSalaryProfile.upsert({
          where: { tenantId_staffUserId: { tenantId, staffUserId: teacherId } },
          update: {
            ...(data.basicSalary !== undefined && { basicSalary }),
            ...(data.housingAllowance !== undefined && { housingAllowance }),
            ...(data.transportAllowance !== undefined && { transportAllowance }),
            ...(data.otherAllowances !== undefined && { otherAllowances }),
            ...(data.bankName !== undefined && { bankName: data.bankName?.trim() || null }),
            ...(data.bankCode !== undefined && { bankCode: data.bankCode?.trim() || null }),
            ...(data.accountNumber !== undefined && { accountNumber: data.accountNumber?.trim() || null }),
            ...(data.accountName !== undefined && { accountName: data.accountName?.trim() || null }),
          },
          create: {
            id: `ssp_${teacherId}`,
            tenantId,
            campusId: existing.campusId,
            staffUserId: teacherId,
            basicSalary,
            housingAllowance,
            transportAllowance,
            otherAllowances,
            bankName: data.bankName?.trim() || null,
            bankCode: data.bankCode?.trim() || null,
            accountNumber: data.accountNumber?.trim() || null,
            accountName: data.accountName?.trim() || null,
            isActive: true,
          },
        });
      }

      return res;
    });

    return this.formatTeacher(updated);
  }

  async delete(tenantId: string, teacherId: string) {
    const existing = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Teacher not found in this school');
    }

    await this.prisma.class.updateMany({
      where: { tenantId, classTeacherId: teacherId },
      data: { classTeacherId: null },
    });

    await this.prisma.teacher.delete({
      where: { id: teacherId },
    });

    return { success: true, message: 'Teacher record removed successfully' };
  }
}
