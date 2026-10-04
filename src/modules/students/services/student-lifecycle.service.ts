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
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status === 'SUSPENDED') {
      throw new BadRequestException('Student is already suspended.');
    }

    const updatedStudent = await this.prisma.student.update({
      where: { id: studentId },
      data: { status: 'SUSPENDED' },
    });

    const lifecycleEvent = await this.prisma.studentLifecycleEvent.create({
      data: {
        id: `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
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
      },
    });

    this.logger.log(`Student ${student.admissionNumber} (${studentId}) suspended by ${actorUserId}`);
    return { student: updatedStudent, lifecycleEvent };
  }

  async reinstateStudent(
    tenantId: string,
    studentId: string,
    actorUserId: string,
    dto: ReinstateStudentDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status !== 'SUSPENDED') {
      throw new BadRequestException('Only suspended students can be reinstated.');
    }

    const updatedStudent = await this.prisma.student.update({
      where: { id: studentId },
      data: { status: 'ACTIVE' },
    });

    const lifecycleEvent = await this.prisma.studentLifecycleEvent.create({
      data: {
        id: `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
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
      },
    });

    this.logger.log(`Student ${student.admissionNumber} (${studentId}) reinstated by ${actorUserId}`);
    return { student: updatedStudent, lifecycleEvent };
  }

  async withdrawStudent(
    tenantId: string,
    studentId: string,
    actorUserId: string,
    dto: WithdrawStudentDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status === 'INACTIVE' || student.status === 'GRADUATED') {
      throw new BadRequestException(`Cannot withdraw student with status "${student.status}".`);
    }

    const updatedStudent = await this.prisma.student.update({
      where: { id: studentId },
      data: { status: 'INACTIVE' },
    });

    const currentEnrollment = await this.prisma.enrollment.findFirst({
      where: { tenantId, studentId, status: 'ACTIVE' },
    });

    if (currentEnrollment) {
      await this.prisma.enrollment.update({
        where: { id: currentEnrollment.id },
        data: { status: 'WITHDRAWN' },
      });
    }

    const lifecycleEvent = await this.prisma.studentLifecycleEvent.create({
      data: {
        id: `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
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
      },
    });

    this.logger.log(`Student ${student.admissionNumber} formally withdrawn (${dto.reason})`);
    return { student: updatedStudent, lifecycleEvent };
  }

  async graduateStudent(
    tenantId: string,
    studentId: string,
    actorUserId: string,
    dto: GraduateStudentDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status === 'GRADUATED') {
      throw new BadRequestException('Student has already graduated.');
    }

    const currentEnrollment = await this.prisma.enrollment.findFirst({
      where: { tenantId, studentId, status: 'ACTIVE' },
    });

    const updatedStudent = await this.prisma.student.update({
      where: { id: studentId },
      data: { status: 'GRADUATED' },
    });

    if (currentEnrollment) {
      await this.prisma.enrollment.update({
        where: { id: currentEnrollment.id },
        data: { status: 'GRADUATED' },
      });
    }

    const alumniId = `alm_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const certificateNumber = dto.certificateNumber || `CERT-${dto.graduationYear}-${student.admissionNumber.replace(/\//g, '-')}`;

    const alumni = await this.prisma.alumniRecord.create({
      data: {
        id: alumniId,
        tenantId,
        studentId,
        admissionNumber: student.admissionNumber,
        studentName: `${student.firstName} ${student.lastName}`,
        graduationYear: dto.graduationYear,
        graduatingClassId: currentEnrollment ? currentEnrollment.classId : null,
        finalCgpa: dto.finalCgpa || null,
        honors: dto.honors || null,
        certificateNumber,
        alumniContactEmail: dto.alumniContactEmail || student.email || null,
        alumniContactPhone: dto.alumniContactPhone || student.phone || null,
        currentOccupation: null,
      },
    });

    const lifecycleEvent = await this.prisma.studentLifecycleEvent.create({
      data: {
        id: `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
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
        notes: dto.notes || `Certificate No: ${certificateNumber}`,
        actorUserId,
        effectiveDate: new Date(),
      },
    });

    this.logger.log(`Student ${student.admissionNumber} graduated into Alumni registry`);
    return { student: updatedStudent, alumniRecord: alumni, alumni, lifecycleEvent };
  }

  async getLifecycleHistory(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    return this.prisma.studentLifecycleEvent.findMany({
      where: { tenantId, studentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStudentTimeline(tenantId: string, studentId: string) {
    return this.getLifecycleHistory(tenantId, studentId);
  }

  async listAlumni(tenantId: string, filter?: AlumniFilterDto) {
    const where: any = { tenantId };

    if (filter?.graduationYear) {
      where.graduationYear = Number(filter.graduationYear);
    }
    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { studentName: { contains: q, mode: 'insensitive' } },
        { admissionNumber: { contains: q, mode: 'insensitive' } },
        { certificateNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    const records = await this.prisma.alumniRecord.findMany({
      where,
      orderBy: { graduationYear: 'desc' },
      include: {
        student: true,
      },
    });

    return records;
  }

  async getAlumniRecords(tenantId: string, filter?: AlumniFilterDto) {
    return this.listAlumni(tenantId, filter);
  }
}
