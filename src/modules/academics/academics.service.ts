import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class AcademicsService {
  private readonly logger = new Logger(AcademicsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- Academic Years ---
  async getAcademicYears(tenantId: string) {
    return this.prisma.academicYear.findMany({
      where: { tenantId },
      include: {
        terms: { orderBy: { startDate: 'asc' } },
        classes: true,
        _count: { select: { enrollments: true, classes: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async getAcademicYearById(tenantId: string, id: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id, tenantId },
      include: { terms: { orderBy: { startDate: 'asc' } }, classes: true },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    return year;
  }

  async createAcademicYear(
    tenantId: string,
    data: { name: string; startDate: string; endDate: string; isCurrent?: boolean },
  ) {
    const id = `ay_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const isCurrent = Boolean(data.isCurrent);

    if (isCurrent) {
      await this.prisma.academicYear.updateMany({
        where: { tenantId, isCurrent: true },
        data: { isCurrent: false },
      });
    }

    return this.prisma.academicYear.create({
      data: {
        id,
        tenantId,
        name: data.name.trim(),
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        isCurrent,
      },
      include: { terms: true },
    });
  }

  async updateAcademicYear(
    tenantId: string,
    id: string,
    data: { name?: string; startDate?: string; endDate?: string; isCurrent?: boolean },
  ) {
    const existing = await this.prisma.academicYear.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Academic year not found');

    const isCurrent = data.isCurrent !== undefined ? Boolean(data.isCurrent) : undefined;
    if (isCurrent) {
      await this.prisma.academicYear.updateMany({
        where: { tenantId, isCurrent: true, id: { not: id } },
        data: { isCurrent: false },
      });
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name.trim();
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);
    if (isCurrent !== undefined) updateData.isCurrent = isCurrent;

    return this.prisma.academicYear.update({
      where: { id },
      data: updateData,
      include: { terms: { orderBy: { startDate: 'asc' } } },
    });
  }

  async setCurrentAcademicYear(tenantId: string, id: string) {
    return this.updateAcademicYear(tenantId, id, { isCurrent: true });
  }

  async deleteAcademicYear(tenantId: string, id: string) {
    const existing = await this.prisma.academicYear.findFirst({
      where: { id, tenantId },
      include: { enrollments: true, classes: true },
    });
    if (!existing) throw new NotFoundException('Academic year not found');

    if (existing.enrollments?.length > 0) {
      throw new BadRequestException(
        `Cannot delete academic year with ${existing.enrollments.length} active student enrollments.`,
      );
    }

    await this.prisma.term.deleteMany({ where: { academicYearId: id, tenantId } });
    await this.prisma.academicYear.delete({ where: { id } });
    return { success: true, message: 'Academic year and associated terms removed successfully' };
  }

  // --- Terms ---
  async getTerms(tenantId: string, academicYearId?: string) {
    const where: any = { tenantId };
    if (academicYearId) where.academicYearId = academicYearId;

    return this.prisma.term.findMany({
      where,
      include: { academicYear: true },
      orderBy: { startDate: 'asc' },
    });
  }

  async createTerm(
    tenantId: string,
    data: { academicYearId: string; name: string; startDate: string; endDate: string; isCurrent?: boolean },
  ) {
    const id = `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const isCurrent = Boolean(data.isCurrent);

    if (isCurrent) {
      await this.prisma.term.updateMany({
        where: { tenantId, academicYearId: data.academicYearId, isCurrent: true },
        data: { isCurrent: false },
      });
    }

    return this.prisma.term.create({
      data: {
        id,
        tenantId,
        academicYearId: data.academicYearId,
        name: data.name.trim(),
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        isCurrent,
      },
    });
  }

  async getTermById(tenantId: string, id: string) {
    const term = await this.prisma.term.findFirst({
      where: { id, tenantId },
      include: { academicYear: true },
    });
    if (!term) throw new NotFoundException('Term not found');
    return term;
  }

  async updateTerm(
    tenantId: string,
    id: string,
    data: { name?: string; startDate?: string; endDate?: string; isCurrent?: boolean },
  ) {
    const existing = await this.prisma.term.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Term not found');

    const isCurrent = data.isCurrent !== undefined ? Boolean(data.isCurrent) : undefined;
    if (isCurrent) {
      await this.prisma.term.updateMany({
        where: { tenantId, academicYearId: existing.academicYearId, isCurrent: true, id: { not: id } },
        data: { isCurrent: false },
      });
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name.trim();
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);
    if (isCurrent !== undefined) updateData.isCurrent = isCurrent;

    return this.prisma.term.update({
      where: { id },
      data: updateData,
      include: { academicYear: true },
    });
  }

  async setCurrentTerm(tenantId: string, id: string) {
    return this.updateTerm(tenantId, id, { isCurrent: true });
  }

  async deleteTerm(tenantId: string, id: string) {
    const existing = await this.prisma.term.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Term not found');

    await this.prisma.term.delete({ where: { id } });
    return { success: true, message: 'Term removed successfully' };
  }

  // --- Academic Calendar Summary & Dynamic Timeline ---
  async getAcademicCalendarSummary(tenantId: string) {
    const years = await this.prisma.academicYear.findMany({
      where: { tenantId },
      include: { terms: { orderBy: { startDate: 'asc' } }, classes: true },
      orderBy: { startDate: 'desc' },
    });

    const currentYear = years.find((y) => y.isCurrent) || years[0] || null;
    let currentTerm: any = null;
    if (currentYear) {
      currentTerm = currentYear.terms.find((t) => t.isCurrent) || currentYear.terms[0] || null;
    }

    const now = new Date();
    let weeksTotal = 14;
    let weeksElapsed = 4;
    let progressPercent = 30;
    let status = 'IN_PROGRESS';
    let nextResumption: string | null = null;

    if (currentTerm) {
      const start = new Date(currentTerm.startDate);
      const end = new Date(currentTerm.endDate);
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const totalDurationMs = Math.max(1, end.getTime() - start.getTime());
      weeksTotal = Math.max(1, Math.round(totalDurationMs / msPerWeek));

      if (now.getTime() < start.getTime()) {
        weeksElapsed = 0;
        progressPercent = 0;
        status = 'UPCOMING';
      } else if (now.getTime() > end.getTime()) {
        weeksElapsed = weeksTotal;
        progressPercent = 100;
        status = 'CONCLUDED';
      } else {
        const elapsedMs = Math.max(0, now.getTime() - start.getTime());
        weeksElapsed = Math.min(weeksTotal, Math.max(1, Math.ceil(elapsedMs / msPerWeek)));
        progressPercent = Math.min(100, Math.round((elapsedMs / totalDurationMs) * 100));
        status = 'IN_PROGRESS';
      }

      if (currentYear) {
        const subsequentTerms = currentYear.terms.filter(
          (t) => new Date(t.startDate).getTime() > new Date(currentTerm.startDate).getTime(),
        );
        if (subsequentTerms.length > 0) {
          nextResumption = subsequentTerms[0].startDate.toISOString();
        }
      }
    }

    const totalClasses = await this.prisma.class.count({ where: { tenantId } });
    const totalEnrollments = await this.prisma.enrollment.count({ where: { tenantId, status: 'ACTIVE' } });
    const totalSubjects = await this.prisma.subject.count({ where: { tenantId } });

    return {
      academicYear: currentYear?.name || null,
      academicYearId: currentYear?.id || null,
      currentTerm: currentTerm?.name || null,
      currentTermId: currentTerm?.id || null,
      termStartDate: currentTerm?.startDate || null,
      termEndDate: currentTerm?.endDate || null,
      weeksTotal,
      weeksElapsed,
      progressPercent,
      status,
      nextResumption,
      terms: currentYear?.terms || [],
      allAcademicYears: years,
      stats: {
        totalClasses,
        totalEnrollments,
        totalSubjects,
      },
    };
  }

  // --- Classes ---
  async getClasses(tenantId: string, campusId?: string) {
    const where: any = { tenantId };
    if (campusId) where.campusId = campusId;

    const classes = await this.prisma.class.findMany({
      where,
      include: {
        campus: true,
        academicYear: true,
        classTeacher: true,
        classSubjects: { include: { subject: true } },
        enrollments: { where: { status: 'ACTIVE' } },
      },
      orderBy: { name: 'asc' },
    });

    return classes.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      campusId: c.campusId,
      campus: c.campus?.name || 'Main Campus',
      academicYearId: c.academicYearId,
      name: c.name,
      gradeLevel: c.gradeLevel,
      stream: c.stream,
      capacity: c.capacity,
      enrolledCount: c.enrollments?.length || 0,
      classTeacher: c.classTeacher
        ? `${c.classTeacher.firstName} ${c.classTeacher.lastName}`
        : null,
      classTeacherId: c.classTeacherId,
      subjects: c.classSubjects?.map((cs) => cs.subject?.name).filter(Boolean) || [],
      status: 'Active',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async createClass(tenantId: string, data: any) {
    let campusId = data.campusId;
    if (campusId) {
      const campusExists = await this.prisma.campus.findFirst({
        where: { id: campusId, tenantId },
      });
      if (!campusExists) campusId = undefined;
    }
    if (!campusId) {
      const campus =
        (await this.prisma.campus.findFirst({ where: { tenantId, isMain: true } })) ||
        (await this.prisma.campus.findFirst({ where: { tenantId } }));
      if (campus) {
        campusId = campus.id;
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

    let academicYearId = data.academicYearId;
    if (academicYearId) {
      const yearExists = await this.prisma.academicYear.findFirst({
        where: { id: academicYearId, tenantId },
      });
      if (!yearExists) academicYearId = undefined;
    }
    if (!academicYearId) {
      const currentYear =
        (await this.prisma.academicYear.findFirst({ where: { tenantId, isCurrent: true } })) ||
        (await this.prisma.academicYear.findFirst({ where: { tenantId } }));
      if (currentYear) {
        academicYearId = currentYear.id;
      } else {
        const yr = new Date().getFullYear();
        const newYear = await this.prisma.academicYear.create({
          data: {
            id: `ay_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            name: `${yr}/${yr + 1}`,
            startDate: new Date(`${yr}-09-01`),
            endDate: new Date(`${yr + 1}-07-31`),
            isCurrent: true,
          },
        });
        academicYearId = newYear.id;
      }
    }

    const id = `cls_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const name = data.name.trim();
    const gradeLevel = (data.gradeLevel || name).trim();
    const capacity = Number(data.capacity) || 40;

    let classTeacherId = data.classTeacherId || null;
    if (!classTeacherId && data.classTeacher && typeof data.classTeacher === 'string' && data.classTeacher.trim()) {
      const teacherParts = data.classTeacher.trim().split(' ');
      const matchingTeacher = await this.prisma.teacher.findFirst({
        where: {
          tenantId,
          OR: [
            { firstName: { in: teacherParts, mode: 'insensitive' } },
            { lastName: { in: teacherParts, mode: 'insensitive' } },
          ],
        },
      });
      if (matchingTeacher) {
        classTeacherId = matchingTeacher.id;
      }
    }

    const created = await this.prisma.class.create({
      data: {
        id,
        tenantId,
        campusId,
        academicYearId,
        name,
        gradeLevel,
        stream: data.stream || null,
        capacity,
        classTeacherId,
      },
      include: {
        campus: true,
        academicYear: true,
        classTeacher: true,
      },
    });

    if (classTeacherId) {
      await this.prisma.teacher.update({
        where: { id: classTeacherId },
        data: { assignedClass: name },
      });
    }

    const subjectNames: string[] = Array.isArray(data.subjects)
      ? data.subjects
      : typeof data.subjects === 'string'
      ? data.subjects.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    const syncedSubjects: string[] = [];
    for (const subName of subjectNames) {
      let sub = await this.prisma.subject.findFirst({
        where: { tenantId, name: { equals: subName, mode: 'insensitive' } },
      });
      if (!sub) {
        const code =
          (subName.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'SUB') +
          Math.floor(Math.random() * 900 + 100);
        sub = await this.prisma.subject.create({
          data: {
            id: `sub_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            name: subName,
            code,
            isElective: false,
          },
        });
      }
      await this.prisma.classSubject.upsert({
        where: { classId_subjectId: { classId: created.id, subjectId: sub.id } },
        update: {},
        create: {
          id: `cs_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          classId: created.id,
          subjectId: sub.id,
        },
      });
      syncedSubjects.push(sub.name);
    }

    return {
      id: created.id,
      tenantId: created.tenantId,
      campusId: created.campusId,
      campus: created.campus?.name || 'Main Campus',
      academicYearId: created.academicYearId,
      name: created.name,
      gradeLevel: created.gradeLevel,
      stream: created.stream,
      capacity: created.capacity,
      enrolledCount: 0,
      classTeacher: created.classTeacher
        ? `${created.classTeacher.firstName} ${created.classTeacher.lastName}`
        : null,
      classTeacherId: created.classTeacherId,
      subjects: syncedSubjects,
      status: 'Active',
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async updateClass(tenantId: string, classId: string, data: any) {
    const existing = await this.prisma.class.findFirst({
      where: { id: classId, tenantId },
      include: { classTeacher: true },
    });
    if (!existing) throw new NotFoundException('Class not found');

    const updateData: any = {};
    if (data.name) updateData.name = data.name.trim();
    if (data.gradeLevel) updateData.gradeLevel = data.gradeLevel.trim();
    if (data.stream !== undefined) updateData.stream = data.stream || null;
    if (data.capacity !== undefined) updateData.capacity = Number(data.capacity);

    let newTeacherId = data.classTeacherId;
    if (newTeacherId === undefined && data.classTeacher && typeof data.classTeacher === 'string' && data.classTeacher.trim()) {
      const teacherParts = data.classTeacher.trim().split(' ');
      const matchingTeacher = await this.prisma.teacher.findFirst({
        where: {
          tenantId,
          OR: [
            { firstName: { in: teacherParts, mode: 'insensitive' } },
            { lastName: { in: teacherParts, mode: 'insensitive' } },
          ],
        },
      });
      if (matchingTeacher) newTeacherId = matchingTeacher.id;
    }

    if (newTeacherId !== undefined) {
      updateData.classTeacherId = newTeacherId || null;
      if (existing.classTeacherId && existing.classTeacherId !== newTeacherId) {
        await this.prisma.teacher.updateMany({
          where: { id: existing.classTeacherId, tenantId },
          data: { assignedClass: null },
        });
      }
      if (newTeacherId) {
        await this.prisma.teacher.update({
          where: { id: newTeacherId },
          data: { assignedClass: data.name ? data.name.trim() : existing.name },
        });
      }
    }

    await this.prisma.class.update({
      where: { id: classId },
      data: updateData,
    });

    if (data.subjects !== undefined) {
      const subjectNames: string[] = Array.isArray(data.subjects)
        ? data.subjects
        : typeof data.subjects === 'string'
        ? data.subjects.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];

      await this.prisma.classSubject.deleteMany({ where: { classId } });

      for (const subName of subjectNames) {
        let sub = await this.prisma.subject.findFirst({
          where: { tenantId, name: { equals: subName, mode: 'insensitive' } },
        });
        if (!sub) {
          const code =
            (subName.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'SUB') +
            Math.floor(Math.random() * 900 + 100);
          sub = await this.prisma.subject.create({
            data: {
              id: `sub_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
              tenantId,
              name: subName,
              code,
              isElective: false,
            },
          });
        }
        await this.prisma.classSubject.create({
          data: {
            id: `cs_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            classId,
            subjectId: sub.id,
          },
        });
      }
    }

    const reloaded = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        campus: true,
        academicYear: true,
        classTeacher: true,
        classSubjects: { include: { subject: true } },
        enrollments: { where: { status: 'ACTIVE' } },
      },
    });

    return {
      id: reloaded!.id,
      tenantId: reloaded!.tenantId,
      campusId: reloaded!.campusId,
      campus: reloaded!.campus?.name || 'Main Campus',
      academicYearId: reloaded!.academicYearId,
      name: reloaded!.name,
      gradeLevel: reloaded!.gradeLevel,
      stream: reloaded!.stream,
      capacity: reloaded!.capacity,
      enrolledCount: reloaded!.enrollments?.length || 0,
      classTeacher: reloaded!.classTeacher
        ? `${reloaded!.classTeacher.firstName} ${reloaded!.classTeacher.lastName}`
        : null,
      classTeacherId: reloaded!.classTeacherId,
      subjects: reloaded!.classSubjects?.map((cs) => cs.subject?.name).filter(Boolean) || [],
      status: 'Active',
      createdAt: reloaded!.createdAt,
      updatedAt: reloaded!.updatedAt,
    };
  }

  async deleteClass(tenantId: string, classId: string) {
    const existing = await this.prisma.class.findFirst({
      where: { id: classId, tenantId },
      include: { enrollments: { where: { status: 'ACTIVE' } } },
    });
    if (!existing) throw new NotFoundException('Class not found');

    if (existing.enrollments?.length > 0) {
      throw new BadRequestException(
        `Cannot delete class with ${existing.enrollments.length} actively enrolled students.`,
      );
    }

    await this.prisma.classSubject.deleteMany({ where: { classId } });
    if (existing.classTeacherId) {
      await this.prisma.teacher.updateMany({
        where: { id: existing.classTeacherId, tenantId },
        data: { assignedClass: null },
      });
    }

    await this.prisma.class.delete({ where: { id: classId } });
    return { success: true, message: 'Class removed successfully' };
  }

  async assignTeacherToClass(tenantId: string, classId: string, teacherId?: string | null) {
    return this.updateClass(tenantId, classId, { classTeacherId: teacherId || null });
  }

  // --- Subjects ---
  async getSubjects(tenantId: string) {
    return this.prisma.subject.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async createSubject(
    tenantId: string,
    data: { code: string; name: string; description?: string; isElective?: boolean },
  ) {
    const id = `sub_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    return this.prisma.subject.create({
      data: {
        id,
        tenantId,
        code: data.code.trim().toUpperCase(),
        name: data.name.trim(),
        description: data.description || null,
        isElective: Boolean(data.isElective),
      },
    });
  }

  async updateSubject(
    tenantId: string,
    id: string,
    data: { code?: string; name?: string; description?: string; isElective?: boolean },
  ) {
    const existing = await this.prisma.subject.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Subject not found');

    const updateData: any = {};
    if (data.code) updateData.code = data.code.trim().toUpperCase();
    if (data.name) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.isElective !== undefined) updateData.isElective = Boolean(data.isElective);

    return this.prisma.subject.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteSubject(tenantId: string, id: string) {
    const existing = await this.prisma.subject.findFirst({
      where: { id, tenantId },
      include: { classSubjects: true },
    });
    if (!existing) throw new NotFoundException('Subject not found');

    await this.prisma.classSubject.deleteMany({ where: { subjectId: id } });
    await this.prisma.subject.delete({ where: { id } });
    return { success: true, message: 'Subject removed successfully' };
  }

  // --- Enrollments ---
  async enrollStudent(
    tenantId: string,
    data: { studentId: string; classId: string; academicYearId: string; rollNumber?: string },
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: data.studentId, tenantId },
    });
    if (!student) throw new NotFoundException('Student not found in this school context');

    const cls = await this.prisma.class.findFirst({
      where: { id: data.classId, tenantId },
    });
    if (!cls) throw new NotFoundException('Class not found in this school context');

    const id = `enr_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    return this.prisma.enrollment.create({
      data: {
        id,
        tenantId,
        studentId: data.studentId,
        classId: data.classId,
        academicYearId: data.academicYearId,
        status: 'ACTIVE',
      },
      include: { class: true, academicYear: true, student: true },
    });
  }

  async getClassEnrollments(tenantId: string, classId: string, academicYearId?: string) {
    const where: any = { tenantId, classId, status: 'ACTIVE' };
    if (academicYearId) where.academicYearId = academicYearId;

    const enrollments = await this.prisma.enrollment.findMany({
      where,
      include: { student: true, class: true },
    });

    return enrollments.map((e) => ({
      id: e.id,
      tenantId: e.tenantId,
      studentId: e.studentId,
      classId: e.classId,
      academicYearId: e.academicYearId,
      status: e.status,
      enrolledAt: e.enrolledAt,
      student: e.student
        ? {
            id: e.student.id,
            admissionNumber: e.student.admissionNumber,
            firstName: e.student.firstName,
            lastName: e.student.lastName,
            gender: e.student.gender,
          }
        : null,
    }));
  }

  async promoteStudents(
    tenantId: string,
    data: { fromClassId: string; toClassId: string; targetAcademicYearId: string; studentIds: string[] },
  ) {
    const results = [];
    for (const studentId of data.studentIds) {
      await this.prisma.enrollment.updateMany({
        where: { tenantId, studentId, classId: data.fromClassId, status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      });

      const id = `enr_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      await this.prisma.enrollment.create({
        data: {
          id,
          tenantId,
          studentId,
          classId: data.toClassId,
          academicYearId: data.targetAcademicYearId,
          status: 'ACTIVE',
        },
      });

      results.push({ studentId, status: 'PROMOTED', toClassId: data.toClassId });
    }

    return {
      success: true,
      promotedCount: results.length,
      promotions: results,
    };
  }

  // --- Class Subject & Teacher Assignments ---
  async assignClassSubject(
    tenantId: string,
    data: { classId: string; subjectId: string; teacherId: string },
  ) {
    const id = `cs_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    return this.prisma.classSubject.upsert({
      where: { classId_subjectId: { classId: data.classId, subjectId: data.subjectId } },
      update: { teacherId: data.teacherId || null },
      create: {
        id,
        classId: data.classId,
        subjectId: data.subjectId,
        teacherId: data.teacherId || null,
      },
      include: { class: true, subject: true, teacher: true },
    });
  }

  async getClassSubjects(tenantId: string, classId: string) {
    const classSubjects = await this.prisma.classSubject.findMany({
      where: { classId, class: { tenantId } },
      include: { subject: true, teacher: true },
    });

    return classSubjects.map((cs) => ({
      id: cs.id,
      classId: cs.classId,
      subjectId: cs.subjectId,
      teacherId: cs.teacherId,
      subjectName: cs.subject?.name || 'Subject',
      subjectCode: cs.subject?.code || '',
      teacherName: cs.teacher ? `${cs.teacher.firstName} ${cs.teacher.lastName}` : 'Teacher',
    }));
  }

  // --- Initial Academic Setup / Onboarding Helper ---
  async initializeDefaultAcademicSetup(tenantId: string) {
    const existingYear = await this.prisma.academicYear.findFirst({ where: { tenantId } });
    if (existingYear) {
      return { success: true, message: 'Academic setup already initialized for this school' };
    }

    const yr = new Date().getFullYear();
    const academicYear = await this.prisma.academicYear.create({
      data: {
        id: `ay_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
        tenantId,
        name: `${yr}/${yr + 1}`,
        startDate: new Date(`${yr}-09-01`),
        endDate: new Date(`${yr + 1}-07-31`),
        isCurrent: true,
      },
    });

    await this.prisma.term.createMany({
      data: [
        {
          id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId,
          academicYearId: academicYear.id,
          name: 'First Term',
          startDate: new Date(`${yr}-09-01`),
          endDate: new Date(`${yr}-12-15`),
          isCurrent: true,
        },
        {
          id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId,
          academicYearId: academicYear.id,
          name: 'Second Term',
          startDate: new Date(`${yr + 1}-01-10`),
          endDate: new Date(`${yr + 1}-04-05`),
          isCurrent: false,
        },
        {
          id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId,
          academicYearId: academicYear.id,
          name: 'Third Term',
          startDate: new Date(`${yr + 1}-04-25`),
          endDate: new Date(`${yr + 1}-07-20`),
          isCurrent: false,
        },
      ],
    });

    let campus = await this.prisma.campus.findFirst({ where: { tenantId, isMain: true } });
    if (!campus) {
      campus = await this.prisma.campus.findFirst({ where: { tenantId } });
    }
    if (!campus) {
      campus = await this.prisma.campus.create({
        data: {
          id: `cmp_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId,
          name: 'Main Campus',
          code: 'MAIN-01',
          isMain: true,
        },
      });
    }

    const defaultClasses = [
      { name: 'JSS 1', gradeLevel: 'Junior Secondary 1' },
      { name: 'JSS 2', gradeLevel: 'Junior Secondary 2' },
      { name: 'JSS 3', gradeLevel: 'Junior Secondary 3' },
      { name: 'SSS 1', gradeLevel: 'Senior Secondary 1' },
      { name: 'SSS 2', gradeLevel: 'Senior Secondary 2' },
      { name: 'SSS 3', gradeLevel: 'Senior Secondary 3' },
    ];

    for (const cls of defaultClasses) {
      await this.prisma.class.create({
        data: {
          id: `cls_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId,
          campusId: campus.id,
          academicYearId: academicYear.id,
          name: cls.name,
          gradeLevel: cls.gradeLevel,
          capacity: 40,
        },
      });
    }

    const defaultSubjects = [
      { code: 'MTH', name: 'Mathematics' },
      { code: 'ENG', name: 'English Language' },
      { code: 'BSC', name: 'Basic Science' },
      { code: 'CIV', name: 'Civic Education' },
      { code: 'BIO', name: 'Biology' },
    ];

    for (const sub of defaultSubjects) {
      await this.prisma.subject.create({
        data: {
          id: `sub_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId,
          code: sub.code,
          name: sub.name,
          isElective: false,
        },
      });
    }

    return {
      success: true,
      message: 'Academic setup initialized with default session, terms, classes, and subjects',
    };
  }
}
