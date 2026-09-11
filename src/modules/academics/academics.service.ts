import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Academic Years ---
  async getAcademicYears(tenantId: string) {
    return Array.from(this.prisma.memoryStore.academicYears.values()).filter(
      (ay) => ay.tenantId === tenantId,
    );
  }

  async createAcademicYear(tenantId: string, data: { name: string; startDate: string; endDate: string; isCurrent?: boolean }) {
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
    return Array.from(this.prisma.memoryStore.terms.values()).filter(
      (t) => t.tenantId === tenantId && (!academicYearId || t.academicYearId === academicYearId),
    );
  }

  async createTerm(tenantId: string, data: { academicYearId: string; name: string; startDate: string; endDate: string; isCurrent?: boolean }) {
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
    return Array.from(this.prisma.memoryStore.classes.values()).filter(
      (c) => c.tenantId === tenantId && (!campusId || c.campusId === campusId),
    );
  }

  async createClass(tenantId: string, data: { campusId: string; academicYearId: string; name: string; gradeLevel: string; stream?: string; capacity?: number }) {
    const id = `cls_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newClass = {
      id,
      tenantId,
      campusId: data.campusId,
      academicYearId: data.academicYearId,
      name: data.name,
      gradeLevel: data.gradeLevel,
      stream: data.stream || null,
      capacity: data.capacity || 40,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.classes.set(id, newClass);
    return newClass;
  }

  // --- Subjects ---
  async getSubjects(tenantId: string) {
    return Array.from(this.prisma.memoryStore.subjects.values()).filter(
      (s) => s.tenantId === tenantId,
    );
  }

  async createSubject(tenantId: string, data: { code: string; name: string; description?: string; isElective?: boolean }) {
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
    const student = this.prisma.memoryStore.students.get(data.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new Error('Student not found in this school context');
    }

    const cls = this.prisma.memoryStore.classes.get(data.classId);
    if (!cls || cls.tenantId !== tenantId) {
      throw new Error('Class not found');
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

    // Update student's active class
    student.currentClassId = data.classId;
    this.prisma.memoryStore.students.set(student.id, student);

    return enrollment;
  }

  async getClassEnrollments(tenantId: string, classId: string, academicYearId?: string) {
    const enrollments = Array.from(this.prisma.memoryStore.enrollments.values())
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

    return enrollments;
  }

  async promoteStudents(
    tenantId: string,
    data: { fromClassId: string; toClassId: string; targetAcademicYearId: string; studentIds: string[] },
  ) {
    const targetClass = this.prisma.memoryStore.classes.get(data.toClassId);
    if (!targetClass || targetClass.tenantId !== tenantId) {
      throw new Error('Target class not found');
    }

    const results = [];
    for (const studentId of data.studentIds) {
      const student = this.prisma.memoryStore.students.get(studentId);
      if (student && student.tenantId === tenantId) {
        // Mark previous enrollment as COMPLETED
        for (const [enrId, enr] of this.prisma.memoryStore.enrollments.entries()) {
          if (enr.tenantId === tenantId && enr.studentId === studentId && enr.classId === data.fromClassId) {
            enr.status = 'COMPLETED';
            this.prisma.memoryStore.enrollments.set(enrId, enr);
          }
        }

        // Create new enrollment
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

        student.currentClassId = data.toClassId;
        this.prisma.memoryStore.students.set(student.id, student);
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
    data: { classId: string; subjectId: string; teacherId: string; periodsPerWeek?: number },
  ) {
    const id = `cs_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const assignment = {
      id,
      tenantId,
      classId: data.classId,
      subjectId: data.subjectId,
      teacherId: data.teacherId,
      periodsPerWeek: data.periodsPerWeek || 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.classSubjects.set(id, assignment);
    return assignment;
  }

  async getClassSubjects(tenantId: string, classId: string) {
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
}
