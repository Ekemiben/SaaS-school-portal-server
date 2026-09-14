import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import {
  SuspendStudentDto,
  ReinstateStudentDto,
  WithdrawStudentDto,
  GraduateStudentDto,
  AlumniFilterDto,
} from '../dto/student-lifecycle.dto.js';

@Injectable()
export class StudentLifecycleService {
  private readonly logger = new Logger(StudentLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  async suspendStudent(
    tenantId: string,
    studentId: string,
    actorUserId: string,
    dto: SuspendStudentDto,
  ) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status === 'SUSPENDED') {
      throw new BadRequestException('Student is already suspended.');
    }

    student.status = 'SUSPENDED';
    student.updatedAt = new Date();
    this.prisma.memoryStore.students.set(studentId, student);

    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = {
      id: lifecycleEventId,
      tenantId,
      studentId,
      eventType: 'SUSPENSION',
      fromCampusId: student.campusId,
      toCampusId: student.campusId,
      fromClassId: null,
      toClassId: null,
      fromAcademicYearId: null,
      toAcademicYearId: null,
      reason: dto.reason,
      notes: dto.notes ? `${dto.notes} (End date: ${dto.endDate || 'Indefinite'})` : `End date: ${dto.endDate || 'Indefinite'}`,
      actorUserId,
      effectiveDate: new Date(),
      createdAt: new Date(),
    };
    this.prisma.memoryStore.studentLifecycleEvents.set(lifecycleEventId, lifecycleEvent);

    this.logger.log(`Student ${student.admissionNumber} (${studentId}) suspended by ${actorUserId}`);
    return { student, lifecycleEvent };
  }

  async reinstateStudent(
    tenantId: string,
    studentId: string,
    actorUserId: string,
    dto: ReinstateStudentDto,
  ) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status !== 'SUSPENDED') {
      throw new BadRequestException('Only suspended students can be reinstated.');
    }

    student.status = 'ACTIVE';
    student.updatedAt = new Date();
    this.prisma.memoryStore.students.set(studentId, student);

    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = {
      id: lifecycleEventId,
      tenantId,
      studentId,
      eventType: 'REINSTATEMENT',
      fromCampusId: student.campusId,
      toCampusId: student.campusId,
      fromClassId: null,
      toClassId: null,
      fromAcademicYearId: null,
      toAcademicYearId: null,
      reason: 'Administrative Reinstatement',
      notes: dto.notes || 'Reinstated to active status',
      actorUserId,
      effectiveDate: new Date(),
      createdAt: new Date(),
    };
    this.prisma.memoryStore.studentLifecycleEvents.set(lifecycleEventId, lifecycleEvent);

    this.logger.log(`Student ${student.admissionNumber} (${studentId}) reinstated by ${actorUserId}`);
    return { student, lifecycleEvent };
  }

  async withdrawStudent(
    tenantId: string,
    studentId: string,
    actorUserId: string,
    dto: WithdrawStudentDto,
  ) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status === 'INACTIVE' || student.status === 'GRADUATED') {
      throw new BadRequestException(`Cannot withdraw student with status "${student.status}".`);
    }

    student.status = 'INACTIVE';
    student.updatedAt = new Date();
    this.prisma.memoryStore.students.set(studentId, student);

    const currentEnrollment = Array.from(this.prisma.memoryStore.enrollments.values()).find(
      (e: any) => e.tenantId === tenantId && e.studentId === studentId && e.status === 'ACTIVE',
    );
    if (currentEnrollment) {
      currentEnrollment.status = 'WITHDRAWN';
      currentEnrollment.completedAt = new Date();
      this.prisma.memoryStore.enrollments.set(currentEnrollment.id, currentEnrollment);
    }

    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = {
      id: lifecycleEventId,
      tenantId,
      studentId,
      eventType: 'WITHDRAWAL',
      fromCampusId: student.campusId,
      toCampusId: null,
      fromClassId: currentEnrollment ? currentEnrollment.classId : null,
      toClassId: null,
      fromAcademicYearId: currentEnrollment ? currentEnrollment.academicYearId : null,
      toAcademicYearId: null,
      reason: dto.reason,
      notes: dto.notes || null,
      actorUserId,
      effectiveDate: new Date(),
      createdAt: new Date(),
    };
    this.prisma.memoryStore.studentLifecycleEvents.set(lifecycleEventId, lifecycleEvent);

    this.logger.log(`Student ${student.admissionNumber} formally withdrawn (${dto.reason})`);
    return { student, lifecycleEvent };
  }

  async graduateStudent(
    tenantId: string,
    studentId: string,
    actorUserId: string,
    dto: GraduateStudentDto,
  ) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status === 'GRADUATED') {
      throw new BadRequestException('Student has already graduated.');
    }

    const currentEnrollment = Array.from(this.prisma.memoryStore.enrollments.values()).find(
      (e: any) => e.tenantId === tenantId && e.studentId === studentId && e.status === 'ACTIVE',
    );

    student.status = 'GRADUATED';
    student.updatedAt = new Date();
    this.prisma.memoryStore.students.set(studentId, student);

    if (currentEnrollment) {
      currentEnrollment.status = 'GRADUATED';
      currentEnrollment.completedAt = new Date();
      this.prisma.memoryStore.enrollments.set(currentEnrollment.id, currentEnrollment);
    }

    const alumniId = `alm_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const alumni = {
      id: alumniId,
      tenantId,
      studentId,
      admissionNumber: student.admissionNumber,
      studentName: `${student.firstName} ${student.lastName}`,
      graduationYear: dto.graduationYear,
      graduatingClassId: currentEnrollment ? currentEnrollment.classId : null,
      finalCgpa: dto.finalCgpa || null,
      honors: dto.honors || null,
      certificateNumber: dto.certificateNumber || `CERT-${dto.graduationYear}-${student.admissionNumber.replace(/\//g, '-')}`,
      alumniContactEmail: dto.alumniContactEmail || student.email || null,
      alumniContactPhone: dto.alumniContactPhone || student.phone || null,
      currentOccupation: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.alumniRecords.set(alumniId, alumni);

    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = {
      id: lifecycleEventId,
      tenantId,
      studentId,
      eventType: 'GRADUATION',
      fromCampusId: student.campusId,
      toCampusId: null,
      fromClassId: currentEnrollment ? currentEnrollment.classId : null,
      toClassId: null,
      fromAcademicYearId: currentEnrollment ? currentEnrollment.academicYearId : null,
      toAcademicYearId: null,
      reason: `Graduation Class of ${dto.graduationYear}`,
      notes: dto.notes || `Certificate No: ${alumni.certificateNumber}`,
      actorUserId,
      effectiveDate: new Date(),
      createdAt: new Date(),
    };
    this.prisma.memoryStore.studentLifecycleEvents.set(lifecycleEventId, lifecycleEvent);

    this.logger.log(`Student ${student.admissionNumber} graduated into Alumni registry`);
    return { student, alumniRecord: alumni, alumni, lifecycleEvent };
  }

  async getLifecycleHistory(tenantId: string, studentId: string) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    return Array.from(this.prisma.memoryStore.studentLifecycleEvents.values())
      .filter((e: any) => e.tenantId === tenantId && e.studentId === studentId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getStudentTimeline(tenantId: string, studentId: string) {
    return this.getLifecycleHistory(tenantId, studentId);
  }

  async listAlumni(tenantId: string, filter?: AlumniFilterDto) {
    let list = Array.from(this.prisma.memoryStore.alumniRecords.values()).filter(
      (a: any) => a.tenantId === tenantId,
    );

    if (filter?.graduationYear) {
      list = list.filter((a: any) => a.graduationYear === Number(filter.graduationYear));
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (a: any) =>
          a.studentName.toLowerCase().includes(q) ||
          a.admissionNumber.toLowerCase().includes(q) ||
          (a.certificateNumber && a.certificateNumber.toLowerCase().includes(q)),
      );
    }

    return list
      .map((a: any) => ({
        ...a,
        student: this.prisma.memoryStore.students.get(a.studentId) || null,
      }))
      .sort((a: any, b: any) => b.graduationYear - a.graduationYear);
  }

  async getAlumniRecords(tenantId: string, filter?: AlumniFilterDto) {
    return this.listAlumni(tenantId, filter);
  }
}
