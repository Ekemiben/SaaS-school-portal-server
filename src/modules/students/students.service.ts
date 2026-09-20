import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    filters: {
      campusId?: string;
      classId?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);

    if (this.prisma.isDbConnected) {
      try {
        const where: any = { tenantId };

        if (filters.campusId) {
          where.campusId = filters.campusId;
        }

        if (filters.status) {
          const s = filters.status.toUpperCase();
          if (['ACTIVE', 'INACTIVE', 'SUSPENDED', 'GRADUATED', 'TRANSFERRED'].includes(s)) {
            where.status = s;
          }
        }

        if (filters.classId) {
          where.enrollments = {
            some: {
              OR: [
                { classId: filters.classId },
                { class: { name: { contains: filters.classId, mode: 'insensitive' } } },
              ],
            },
          };
        }

        if (filters.search) {
          const q = filters.search.trim();
          where.OR = [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { middleName: { contains: q, mode: 'insensitive' } },
            { admissionNumber: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
          ];
        }

        const [students, total] = await Promise.all([
          this.prisma.student.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
              campus: true,
              parents: { include: { parent: true } },
              enrollments: {
                where: { status: 'ACTIVE' },
                include: { class: true, academicYear: true },
                orderBy: { enrolledAt: 'desc' },
              },
            },
          }),
          this.prisma.student.count({ where }),
        ]);

        const items = students.map((s) => ({
          id: s.id,
          tenantId: s.tenantId,
          campusId: s.campusId,
          campus: s.campus?.name || 'Main Campus',
          admissionNumber: s.admissionNumber,
          firstName: s.firstName,
          middleName: s.middleName,
          lastName: s.lastName,
          fullName: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' '),
          gender: s.gender,
          dateOfBirth: s.dateOfBirth,
          bloodGroup: s.bloodGroup,
          email: s.email,
          phone: s.phone,
          address: s.address,
          photoUrl: s.photoUrl,
          status: s.status,
          classLevel: s.enrollments?.[0]?.class?.name || (s as any).classLevel || 'Unassigned',
          classId: s.enrollments?.[0]?.classId || null,
          guardianName: s.parents?.[0]?.parent
            ? `${s.parents[0].parent.firstName} ${s.parents[0].parent.lastName}`
            : null,
          guardianRelationship: s.parents?.[0]?.parent?.relationship || 'Parent',
          guardianPhone: s.parents?.[0]?.parent?.phone || null,
          guardianEmail: s.parents?.[0]?.parent?.email || null,
          guardianAddress: s.parents?.[0]?.parent?.address || null,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        }));

        // Mirror into memoryStore
        for (const item of items) {
          this.prisma.memoryStore.students.set(item.id, item);
        }

        return {
          items,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        };
      } catch (err: any) {
        this.logger.warn(`Failed querying students from DB, falling back to memoryStore: ${err.message}`);
      }
    }

    // In-memory fallback
    let all = Array.from(this.prisma.memoryStore.students.values()).filter(
      (s: any) => s.tenantId === tenantId,
    );

    if (filters.campusId) {
      all = all.filter((s: any) => s.campusId === filters.campusId);
    }

    if (filters.classId) {
      const targetClass = filters.classId.toLowerCase();
      all = all.filter(
        (s: any) =>
          (s.classId && s.classId.toLowerCase() === targetClass) ||
          (s.classLevel && s.classLevel.toLowerCase() === targetClass),
      );
    }

    if (filters.status) {
      const targetStatus = filters.status.toLowerCase();
      all = all.filter(
        (s: any) => s.status && s.status.toLowerCase() === targetStatus,
      );
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      all = all.filter(
        (s: any) =>
          (s.firstName || '').toLowerCase().includes(q) ||
          (s.lastName || '').toLowerCase().includes(q) ||
          (s.middleName || '').toLowerCase().includes(q) ||
          (s.admissionNumber || '').toLowerCase().includes(q) ||
          (s.guardianName || '').toLowerCase().includes(q),
      );
    }

    const total = all.length;
    const items = all.slice((page - 1) * limit, page * limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findById(tenantId: string, studentId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const s = await this.prisma.student.findFirst({
          where: { id: studentId, tenantId },
          include: {
            campus: true,
            parents: { include: { parent: true } },
            enrollments: {
              include: { class: true, academicYear: true },
              orderBy: { enrolledAt: 'desc' },
            },
          },
        });

        if (s) {
          return {
            id: s.id,
            tenantId: s.tenantId,
            campusId: s.campusId,
            campus: s.campus?.name || 'Main Campus',
            admissionNumber: s.admissionNumber,
            firstName: s.firstName,
            middleName: s.middleName,
            lastName: s.lastName,
            fullName: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' '),
            gender: s.gender,
            dateOfBirth: s.dateOfBirth,
            bloodGroup: s.bloodGroup,
            email: s.email,
            phone: s.phone,
            address: s.address,
            photoUrl: s.photoUrl,
            status: s.status,
            classLevel: s.enrollments?.[0]?.class?.name || (s as any).classLevel || 'Unassigned',
            classId: s.enrollments?.[0]?.classId || null,
            guardianName: s.parents?.[0]?.parent
              ? `${s.parents[0].parent.firstName} ${s.parents[0].parent.lastName}`
              : null,
            guardianRelationship: s.parents?.[0]?.parent?.relationship || 'Parent',
            guardianPhone: s.parents?.[0]?.parent?.phone || null,
            guardianEmail: s.parents?.[0]?.parent?.email || null,
            guardianAddress: s.parents?.[0]?.parent?.address || null,
            enrollments: s.enrollments,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Failed querying student by id from DB: ${err.message}`);
      }
    }

    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student record not found in this school.');
    }

    const campus = this.prisma.memoryStore.campuses.get(student.campusId);
    const enrollments = Array.from(this.prisma.memoryStore.enrollments.values()).filter(
      (e) => e.studentId === studentId && e.tenantId === tenantId,
    );

    return {
      ...student,
      campus,
      enrollments,
    };
  }

  async create(
    tenantId: string,
    data: {
      campusId?: string;
      admissionNumber?: string;
      firstName: string;
      middleName?: string;
      lastName: string;
      gender?: string;
      dateOfBirth?: string;
      bloodGroup?: string;
      email?: string;
      phone?: string;
      address?: string;
      classId?: string;
      classLevel?: string;
      academicYearId?: string;
      status?: string;
      guardianName?: string;
      guardianRelationship?: string;
      guardianPhone?: string;
      guardianEmail?: string;
      guardianAddress?: string;
      [key: string]: any;
    },
  ) {
    if (this.prisma.isDbConnected) {
      try {
        // 1. Resolve campusId in PostgreSQL
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

        // 2. Resolve admission number
        let admissionNumber = (data.admissionNumber || '').trim();
        if (!admissionNumber) {
          admissionNumber = `SCH/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
        }

        // Check collision in this tenant
        const existing = await this.prisma.student.findUnique({
          where: { tenantId_admissionNumber: { tenantId, admissionNumber } },
        });
        if (existing) {
          admissionNumber = `${admissionNumber}-${Math.floor(100 + Math.random() * 900)}`;
        }

        // 3. Map status
        let studentStatus: any = 'ACTIVE';
        if (data.status) {
          const s = data.status.toUpperCase();
          if (['ACTIVE', 'INACTIVE', 'SUSPENDED', 'GRADUATED', 'TRANSFERRED'].includes(s)) {
            studentStatus = s;
          }
        }

        // 4. Create student in PostgreSQL
        const studentId = `std_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
        const createdStudent = await this.prisma.student.create({
          data: {
            id: studentId,
            tenantId,
            campusId,
            admissionNumber,
            firstName: data.firstName.trim(),
            middleName: data.middleName ? data.middleName.trim() : null,
            lastName: data.lastName.trim(),
            gender: data.gender || 'Male',
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
            bloodGroup: data.bloodGroup || null,
            email: data.email ? data.email.toLowerCase().trim() : null,
            phone: data.phone ? data.phone.trim() : null,
            address: data.address || data.guardianAddress || null,
            status: studentStatus,
          },
          include: {
            campus: true,
          },
        });

        // 5. Create Parent & StudentParent if guardian info provided
        if (data.guardianName || data.guardianPhone) {
          const nameParts = (data.guardianName || 'Guardian').trim().split(/\s+/);
          const pFirstName = nameParts[0] || 'Guardian';
          const pLastName = nameParts.slice(1).join(' ') || 'Parent';
          const phoneClean = (data.guardianPhone || '').replace(/\s+/g, '') || '0000000000';

          const parentRecord = await this.prisma.parent.create({
            data: {
              id: `par_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
              tenantId,
              firstName: pFirstName,
              lastName: pLastName,
              phone: phoneClean,
              email: data.guardianEmail ? data.guardianEmail.toLowerCase().trim() : null,
              address: data.guardianAddress || null,
              relationship: data.guardianRelationship || 'Parent',
            },
          });

          await this.prisma.studentParent.create({
            data: {
              id: `sp_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
              studentId: createdStudent.id,
              parentId: parentRecord.id,
              isPrimaryContact: true,
            },
          });
        }

        // 6. Create Class and Academic Year if provided
        let academicYear =
          (await this.prisma.academicYear.findFirst({
            where: { tenantId, isCurrent: true },
          })) ||
          (await this.prisma.academicYear.findFirst({
            where: { tenantId },
          }));
        if (!academicYear) {
          const yr = new Date().getFullYear();
          academicYear = await this.prisma.academicYear.create({
            data: {
              id: `ay_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
              tenantId,
              name: `${yr}/${yr + 1}`,
              startDate: new Date(`${yr}-09-01`),
              endDate: new Date(`${yr + 1}-07-31`),
              isCurrent: true,
            },
          });
        }

        let classRecord: any = null;
        if (data.classId) {
          classRecord = await this.prisma.class.findFirst({
            where: { id: data.classId, tenantId },
          });
        }
        const targetClassLevel = (data.classLevel || data.className || '').trim();
        if (!classRecord && targetClassLevel) {
          classRecord = await this.prisma.class.findFirst({
            where: { name: targetClassLevel, tenantId },
          });
          if (!classRecord) {
            classRecord = await this.prisma.class.create({
              data: {
                id: `cls_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
                tenantId,
                campusId,
                academicYearId: academicYear.id,
                name: targetClassLevel,
                gradeLevel: targetClassLevel,
              },
            });
          }
        }

        if (classRecord && academicYear) {
          await this.prisma.enrollment.create({
            data: {
              id: `enr_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
              tenantId,
              studentId: createdStudent.id,
              classId: classRecord.id,
              academicYearId: academicYear.id,
              status: 'ACTIVE',
            },
          });
        }

        const formatted = {
          id: createdStudent.id,
          tenantId: createdStudent.tenantId,
          campusId: createdStudent.campusId,
          campus: createdStudent.campus?.name || 'Main Campus',
          admissionNumber: createdStudent.admissionNumber,
          firstName: createdStudent.firstName,
          middleName: createdStudent.middleName,
          lastName: createdStudent.lastName,
          fullName: [createdStudent.firstName, createdStudent.middleName, createdStudent.lastName].filter(Boolean).join(' '),
          gender: createdStudent.gender,
          dateOfBirth: createdStudent.dateOfBirth,
          bloodGroup: createdStudent.bloodGroup,
          email: createdStudent.email,
          phone: createdStudent.phone,
          address: createdStudent.address,
          photoUrl: createdStudent.photoUrl,
          status: createdStudent.status,
          classLevel: classRecord?.name || targetClassLevel || 'Unassigned',
          classId: classRecord?.id || null,
          guardianName: data.guardianName || null,
          guardianRelationship: data.guardianRelationship || 'Parent',
          guardianPhone: data.guardianPhone || null,
          guardianEmail: data.guardianEmail || null,
          guardianAddress: data.guardianAddress || null,
          createdAt: createdStudent.createdAt,
          updatedAt: createdStudent.updatedAt,
        };

        this.prisma.memoryStore.students.set(createdStudent.id, formatted);
        return formatted;
      } catch (err: any) {
        this.logger.error(`Failed persisting student to PostgreSQL: ${err.message}`, err.stack);
        throw err;
      }
    }

    // In-memory fallback
    const admissionNumber =
      data.admissionNumber ||
      `SCH/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;

    const existing = Array.from(this.prisma.memoryStore.students.values()).find(
      (s: any) => s.tenantId === tenantId && s.admissionNumber === admissionNumber,
    );
    if (existing) {
      throw new ConflictException(
        `A student with admission number "${admissionNumber}" already exists in this school.`,
      );
    }

    const studentId = `std_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const student = {
      ...data,
      id: studentId,
      tenantId,
      campusId: data.campusId || 'campus_001',
      admissionNumber,
      firstName: data.firstName,
      middleName: data.middleName || null,
      lastName: data.lastName,
      gender: data.gender || 'Male',
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      bloodGroup: data.bloodGroup || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      status: data.status ? data.status.toUpperCase() : 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.students.set(studentId, student);
    return student;
  }

  async update(tenantId: string, studentId: string, data: Partial<any>) {
    if (this.prisma.isDbConnected) {
      try {
        const existing = await this.prisma.student.findFirst({
          where: { id: studentId, tenantId },
        });
        if (!existing) {
          throw new NotFoundException('Student record not found in this school.');
        }

        const updateData: any = {};
        if (data.firstName) updateData.firstName = data.firstName.trim();
        if (data.middleName !== undefined) updateData.middleName = data.middleName ? data.middleName.trim() : null;
        if (data.lastName) updateData.lastName = data.lastName.trim();
        if (data.gender) updateData.gender = data.gender;
        if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);
        if (data.bloodGroup !== undefined) updateData.bloodGroup = data.bloodGroup || null;
        if (data.email !== undefined) updateData.email = data.email ? data.email.toLowerCase().trim() : null;
        if (data.phone !== undefined) updateData.phone = data.phone ? data.phone.trim() : null;
        if (data.address !== undefined) updateData.address = data.address || null;
        if (data.status) {
          const s = data.status.toUpperCase();
          if (['ACTIVE', 'INACTIVE', 'SUSPENDED', 'GRADUATED', 'TRANSFERRED'].includes(s)) {
            updateData.status = s;
          }
        }

        const updated = await this.prisma.student.update({
          where: { id: studentId },
          data: updateData,
          include: {
            campus: true,
            parents: { include: { parent: true } },
            enrollments: { include: { class: true, academicYear: true } },
          },
        });

        const formatted = {
          id: updated.id,
          tenantId: updated.tenantId,
          campusId: updated.campusId,
          campus: updated.campus?.name || 'Main Campus',
          admissionNumber: updated.admissionNumber,
          firstName: updated.firstName,
          middleName: updated.middleName,
          lastName: updated.lastName,
          fullName: [updated.firstName, updated.middleName, updated.lastName].filter(Boolean).join(' '),
          gender: updated.gender,
          dateOfBirth: updated.dateOfBirth,
          bloodGroup: updated.bloodGroup,
          email: updated.email,
          phone: updated.phone,
          address: updated.address,
          photoUrl: updated.photoUrl,
          status: updated.status,
          classLevel: updated.enrollments?.[0]?.class?.name || (updated as any).classLevel || 'Unassigned',
          classId: updated.enrollments?.[0]?.classId || null,
          guardianName: updated.parents?.[0]?.parent
            ? `${updated.parents[0].parent.firstName} ${updated.parents[0].parent.lastName}`
            : null,
          guardianRelationship: updated.parents?.[0]?.parent?.relationship || 'Parent',
          guardianPhone: updated.parents?.[0]?.parent?.phone || null,
          guardianEmail: updated.parents?.[0]?.parent?.email || null,
          guardianAddress: updated.parents?.[0]?.parent?.address || null,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };

        this.prisma.memoryStore.students.set(studentId, formatted);
        return formatted;
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Failed updating student in DB: ${err.message}`);
      }
    }

    const student = await this.findById(tenantId, studentId);
    Object.assign(student, data, { updatedAt: new Date() });
    this.prisma.memoryStore.students.set(studentId, student);
    return student;
  }

  async delete(tenantId: string, studentId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const existing = await this.prisma.student.findFirst({
          where: { id: studentId, tenantId },
        });
        if (!existing) {
          throw new NotFoundException('Student record not found in this school.');
        }

        await this.prisma.student.delete({
          where: { id: studentId },
        });

        this.prisma.memoryStore.students.delete(studentId);
        return { success: true, message: 'Student removed successfully' };
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Failed deleting student from DB: ${err.message}`);
      }
    }

    await this.findById(tenantId, studentId);
    this.prisma.memoryStore.students.delete(studentId);
    return { success: true, message: 'Student removed successfully' };
  }
}
