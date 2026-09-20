import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class AcademicsService {
  private readonly logger = new Logger(AcademicsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- Academic Years ---
  async getAcademicYears(tenantId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const years = await this.prisma.academicYear.findMany({
          where: { tenantId },
          include: { terms: true, classes: true },
          orderBy: { startDate: 'desc' },
        });

        for (const y of years) {
          this.prisma.memoryStore.academicYears.set(y.id, y);
        }
        return years;
      } catch (err: any) {
        this.logger.warn(`Failed querying academic years from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.academicYears.values()).filter(
      (ay) => ay.tenantId === tenantId,
    );
  }

  async createAcademicYear(
    tenantId: string,
    data: { name: string; startDate: string; endDate: string; isCurrent?: boolean },
  ) {
    if (this.prisma.isDbConnected) {
      try {
        const id = `ay_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
        const isCurrent = Boolean(data.isCurrent);

        if (isCurrent) {
          await this.prisma.academicYear.updateMany({
            where: { tenantId, isCurrent: true },
            data: { isCurrent: false },
          });
        }

        const created = await this.prisma.academicYear.create({
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

        this.prisma.memoryStore.academicYears.set(created.id, created);
        return created;
      } catch (err: any) {
        this.logger.error(`Failed creating academic year in DB: ${err.message}`, err.stack);
        throw err;
      }
    }

    const id = `ay_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newYear = {
      id,
      tenantId,
      name: data.name,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      isCurrent: !!data.isCurrent,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.academicYears.set(id, newYear);
    return newYear;
  }

  // --- Terms ---
  async getTerms(tenantId: string, academicYearId?: string) {
    if (this.prisma.isDbConnected) {
      try {
        const where: any = { tenantId };
        if (academicYearId) where.academicYearId = academicYearId;

        const terms = await this.prisma.term.findMany({
          where,
          include: { academicYear: true },
          orderBy: { startDate: 'asc' },
        });

        for (const t of terms) {
          this.prisma.memoryStore.terms.set(t.id, t);
        }
        return terms;
      } catch (err: any) {
        this.logger.warn(`Failed querying terms from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.terms.values()).filter(
      (t) => t.tenantId === tenantId && (!academicYearId || t.academicYearId === academicYearId),
    );
  }

  async createTerm(
    tenantId: string,
    data: { academicYearId: string; name: string; startDate: string; endDate: string; isCurrent?: boolean },
  ) {
    if (this.prisma.isDbConnected) {
      try {
        const id = `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
        const isCurrent = Boolean(data.isCurrent);

        if (isCurrent) {
          await this.prisma.term.updateMany({
            where: { tenantId, academicYearId: data.academicYearId, isCurrent: true },
            data: { isCurrent: false },
          });
        }

        const created = await this.prisma.term.create({
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

        this.prisma.memoryStore.terms.set(created.id, created);
        return created;
      } catch (err: any) {
        this.logger.error(`Failed creating term in DB: ${err.message}`, err.stack);
        throw err;
      }
    }

    const id = `term_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newTerm = {
      id,
      tenantId,
      academicYearId: data.academicYearId,
      name: data.name,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      isCurrent: !!data.isCurrent,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.terms.set(id, newTerm);
    return newTerm;
  }

  // --- Classes ---
  async getClasses(tenantId: string, campusId?: string) {
    if (this.prisma.isDbConnected) {
      try {
        const where: any = { tenantId };
        if (campusId) where.campusId = campusId;

        const classes = await this.prisma.class.findMany({
          where,
          include: {
            campus: true,
            academicYear: true,
            classTeacher: true,
            enrollments: { where: { status: 'ACTIVE' } },
          },
          orderBy: { name: 'asc' },
        });

        const items = classes.map((c) => ({
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
          status: 'Active',
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }));

        for (const item of items) {
          this.prisma.memoryStore.classes.set(item.id, item);
        }
        return items;
      } catch (err: any) {
        this.logger.warn(`Failed querying classes from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.classes.values()).filter(
      (c) => c.tenantId === tenantId && (!campusId || c.campusId === campusId),
    );
  }

  async createClass(tenantId: string, data: any) {
    if (this.prisma.isDbConnected) {
      try {
        // Resolve campusId
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

        // Resolve academicYearId
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
            classTeacherId: data.classTeacherId || null,
          },
          include: { campus: true, academicYear: true },
        });

        const formatted = {
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
          classTeacher: null,
          status: 'Active',
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };

        this.prisma.memoryStore.classes.set(created.id, formatted);
        return formatted;
      } catch (err: any) {
        this.logger.error(`Failed creating class in DB: ${err.message}`, err.stack);
        throw err;
      }
    }

    const id = `cls_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newClass = {
      id,
      tenantId,
      campusId: data.campusId || 'campus_main_01',
      academicYearId: data.academicYearId || 'ay_2026_2027',
      name: data.name,
      gradeLevel: data.gradeLevel,
      stream: data.stream || null,
      classTeacher: data.classTeacher || null,
      roomLocation: data.roomLocation || null,
      capacity: Number(data.capacity) || 40,
      enrolledCount: 0,
      status: data.status || 'Active',
      subjects: Array.isArray(data.subjects)
        ? data.subjects
        : data.subjects
        ? data.subjects.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.classes.set(id, newClass);
    return newClass;
  }

  async updateClass(tenantId: string, classId: string, data: any) {
    if (this.prisma.isDbConnected) {
      try {
        const existing = await this.prisma.class.findFirst({
          where: { id: classId, tenantId },
        });
        if (!existing) throw new NotFoundException('Class not found');

        const updateData: any = {};
        if (data.name) updateData.name = data.name.trim();
        if (data.gradeLevel) updateData.gradeLevel = data.gradeLevel.trim();
        if (data.stream !== undefined) updateData.stream = data.stream || null;
        if (data.capacity !== undefined) updateData.capacity = Number(data.capacity);
        if (data.classTeacherId !== undefined) updateData.classTeacherId = data.classTeacherId || null;

        const updated = await this.prisma.class.update({
          where: { id: classId },
          data: updateData,
          include: {
            campus: true,
            classTeacher: true,
            enrollments: { where: { status: 'ACTIVE' } },
          },
        });

        const formatted = {
          id: updated.id,
          tenantId: updated.tenantId,
          campusId: updated.campusId,
          campus: updated.campus?.name || 'Main Campus',
          academicYearId: updated.academicYearId,
          name: updated.name,
          gradeLevel: updated.gradeLevel,
          stream: updated.stream,
          capacity: updated.capacity,
          enrolledCount: updated.enrollments?.length || 0,
          classTeacher: updated.classTeacher
            ? `${updated.classTeacher.firstName} ${updated.classTeacher.lastName}`
            : null,
          classTeacherId: updated.classTeacherId,
          status: 'Active',
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };

        this.prisma.memoryStore.classes.set(classId, formatted);
        return formatted;
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Failed updating class in DB: ${err.message}`);
      }
    }

    const cls = this.prisma.memoryStore.classes.get(classId);
    if (!cls || cls.tenantId !== tenantId) {
      throw new NotFoundException('Class not found');
    }
    const updated = {
      ...cls,
      ...data,
      capacity: data.capacity !== undefined ? Number(data.capacity) : cls.capacity,
      subjects: Array.isArray(data.subjects)
        ? data.subjects
        : typeof data.subjects === 'string'
        ? data.subjects.split(',').map((s: string) => s.trim()).filter(Boolean)
        : cls.subjects,
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.classes.set(classId, updated);
    return updated;
  }

  async deleteClass(tenantId: string, classId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const existing = await this.prisma.class.findFirst({
          where: { id: classId, tenantId },
        });
        if (!existing) throw new NotFoundException('Class not found');

        await this.prisma.class.delete({ where: { id: classId } });
        this.prisma.memoryStore.classes.delete(classId);
        return { success: true, message: 'Class removed successfully' };
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Failed deleting class in DB: ${err.message}`);
      }
    }

    const cls = this.prisma.memoryStore.classes.get(classId);
    if (!cls || cls.tenantId !== tenantId) {
      throw new NotFoundException('Class not found');
    }
    this.prisma.memoryStore.classes.delete(classId);
    return { success: true, message: 'Class removed successfully' };
  }

  // --- Subjects ---
  async getSubjects(tenantId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const subjects = await this.prisma.subject.findMany({
          where: { tenantId },
          orderBy: { name: 'asc' },
        });
        for (const s of subjects) {
          this.prisma.memoryStore.subjects.set(s.id, s);
        }
        return subjects;
      } catch (err: any) {
        this.logger.warn(`Failed querying subjects from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.subjects.values()).filter(
      (s) => s.tenantId === tenantId,
    );
  }

  async createSubject(
    tenantId: string,
    data: { code: string; name: string; description?: string; isElective?: boolean },
  ) {
    if (this.prisma.isDbConnected) {
      try {
        const id = `sub_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
        const created = await this.prisma.subject.create({
          data: {
            id,
            tenantId,
            code: data.code.trim().toUpperCase(),
            name: data.name.trim(),
            description: data.description || null,
            isElective: Boolean(data.isElective),
          },
        });
        this.prisma.memoryStore.subjects.set(created.id, created);
        return created;
      } catch (err: any) {
        this.logger.error(`Failed creating subject in DB: ${err.message}`);
        throw err;
      }
    }

    const id = `sub_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newSub = {
      id,
      tenantId,
      code: data.code.toUpperCase(),
      name: data.name,
      description: data.description || null,
      isElective: !!data.isElective,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.subjects.set(id, newSub);
    return newSub;
  }

  // --- Enrollments ---
  async enrollStudent(
    tenantId: string,
    data: { studentId: string; classId: string; academicYearId: string; rollNumber?: string },
  ) {
    if (this.prisma.isDbConnected) {
      try {
        const student = await this.prisma.student.findFirst({
          where: { id: data.studentId, tenantId },
        });
        if (!student) throw new NotFoundException('Student not found in this school context');

        const cls = await this.prisma.class.findFirst({
          where: { id: data.classId, tenantId },
        });
        if (!cls) throw new NotFoundException('Class not found in this school context');

        const id = `enr_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
        const created = await this.prisma.enrollment.create({
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

        this.prisma.memoryStore.enrollments.set(created.id, created);
        return created;
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.error(`Failed enrolling student in DB: ${err.message}`);
        throw err;
      }
    }

    const student = this.prisma.memoryStore.students.get(data.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student not found in this school context');
    }

    const cls = this.prisma.memoryStore.classes.get(data.classId);
    if (!cls || cls.tenantId !== tenantId) {
      throw new NotFoundException('Class not found');
    }

    const id = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const enrollment = {
      id,
      tenantId,
      studentId: data.studentId,
      classId: data.classId,
      academicYearId: data.academicYearId,
      rollNumber: data.rollNumber || null,
      status: 'ACTIVE',
      enrolledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.enrollments.set(id, enrollment);
    return enrollment;
  }

  async getClassEnrollments(tenantId: string, classId: string, academicYearId?: string) {
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        this.logger.warn(`Failed querying class enrollments from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.enrollments.values())
      .filter(
        (e) =>
          e.tenantId === tenantId &&
          e.classId === classId &&
          (!academicYearId || e.academicYearId === academicYearId) &&
          e.status === 'ACTIVE',
      )
      .map((e) => {
        const student = this.prisma.memoryStore.students.get(e.studentId);
        return {
          ...e,
          student: student
            ? {
                id: student.id,
                admissionNumber: student.admissionNumber,
                firstName: student.firstName,
                lastName: student.lastName,
                gender: student.gender,
              }
            : null,
        };
      });
  }

  async promoteStudents(
    tenantId: string,
    data: { fromClassId: string; toClassId: string; targetAcademicYearId: string; studentIds: string[] },
  ) {
    if (this.prisma.isDbConnected) {
      try {
        const results = [];
        for (const studentId of data.studentIds) {
          // Complete old enrollment
          await this.prisma.enrollment.updateMany({
            where: { tenantId, studentId, classId: data.fromClassId, status: 'ACTIVE' },
            data: { status: 'COMPLETED' },
          });

          // Create new enrollment
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
      } catch (err: any) {
        this.logger.error(`Failed promoting students in DB: ${err.message}`);
        throw err;
      }
    }

    const targetClass = this.prisma.memoryStore.classes.get(data.toClassId);
    if (!targetClass || targetClass.tenantId !== tenantId) {
      throw new NotFoundException('Target class not found');
    }

    const results = [];
    for (const studentId of data.studentIds) {
      const student = this.prisma.memoryStore.students.get(studentId);
      if (student && student.tenantId === tenantId) {
        for (const [enrId, enr] of this.prisma.memoryStore.enrollments.entries()) {
          if (enr.tenantId === tenantId && enr.studentId === studentId && enr.classId === data.fromClassId) {
            enr.status = 'COMPLETED';
            this.prisma.memoryStore.enrollments.set(enrId, enr);
          }
        }

        const id = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
        const newEnrollment = {
          id,
          tenantId,
          studentId,
          classId: data.toClassId,
          academicYearId: data.targetAcademicYearId,
          status: 'ACTIVE',
          enrolledAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.prisma.memoryStore.enrollments.set(id, newEnrollment);
        results.push({ studentId, status: 'PROMOTED', toClassId: data.toClassId });
      }
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
    if (this.prisma.isDbConnected) {
      try {
        const id = `cs_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
        const upserted = await this.prisma.classSubject.upsert({
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

        return upserted;
      } catch (err: any) {
        this.logger.error(`Failed assigning class subject in DB: ${err.message}`);
        throw err;
      }
    }

    const id = `cs_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const assignment = {
      id,
      tenantId,
      classId: data.classId,
      subjectId: data.subjectId,
      teacherId: data.teacherId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.classSubjects.set(id, assignment);
    return assignment;
  }

  async getClassSubjects(tenantId: string, classId: string) {
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        this.logger.warn(`Failed querying class subjects from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.classSubjects.values())
      .filter((cs) => cs.tenantId === tenantId && cs.classId === classId)
      .map((cs) => {
        const subject = this.prisma.memoryStore.subjects.get(cs.subjectId);
        const teacher = this.prisma.memoryStore.teachers.get(cs.teacherId);
        return {
          ...cs,
          subjectName: subject?.name || 'Subject',
          subjectCode: subject?.code || '',
          teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Teacher',
        };
      });
  }

  // --- Initial Academic Setup / Onboarding Helper ---
  async initializeDefaultAcademicSetup(tenantId: string) {
    if (!this.prisma.isDbConnected) {
      return { success: true, message: 'In-memory fallback mode active' };
    }

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

    // Create 3 Terms
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

    // Resolve Main Campus
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

    // Create Standard Foundation Classes
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

    // Create Standard Subjects
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
