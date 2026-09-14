import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import { TransferStudentClassDto, TransferStudentCampusDto } from '../dto/transfer-student.dto.js';

@Injectable()
export class StudentTransferService {
  private readonly logger = new Logger(StudentTransferService.name);

  constructor(private readonly prisma: PrismaService) {}

  async transferClass(
    tenantId: string,
    studentId: string,
    actorUserId: string,
    dto: TransferStudentClassDto,
  ) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status !== 'ACTIVE') {
      throw new BadRequestException(`Cannot transfer student in "${student.status}" status.`);
    }

    const targetClass = this.prisma.memoryStore.classes.get(dto.targetClassId);
    if (!targetClass || targetClass.tenantId !== tenantId) {
      throw new NotFoundException(`Target class ${dto.targetClassId} not found`);
    }

    const currentEnrollment = Array.from(this.prisma.memoryStore.enrollments.values()).find(
      (e: any) => e.tenantId === tenantId && e.studentId === studentId && e.status === 'ACTIVE',
    );

    if (!currentEnrollment) {
      throw new BadRequestException('Student does not have an active enrollment to transfer from.');
    }

    if (currentEnrollment.classId === dto.targetClassId) {
      throw new BadRequestException('Student is already in the target class.');
    }

    const fromClassId = currentEnrollment.classId;
    currentEnrollment.status = 'TRANSFERRED';
    currentEnrollment.completedAt = new Date();
    this.prisma.memoryStore.enrollments.set(currentEnrollment.id, currentEnrollment);

    const newEnrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newEnrollment = {
      id: newEnrollmentId,
      tenantId,
      studentId,
      classId: dto.targetClassId,
      academicYearId: currentEnrollment.academicYearId,
      rollNumber: dto.rollNumber || currentEnrollment.rollNumber,
      status: 'ACTIVE',
      enrolledAt: new Date(),
    };
    this.prisma.memoryStore.enrollments.set(newEnrollmentId, newEnrollment);

    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = {
      id: lifecycleEventId,
      tenantId,
      studentId,
      eventType: 'CLASS_TRANSFER',
      fromCampusId: student.campusId,
      toCampusId: student.campusId,
      fromClassId,
      toClassId: dto.targetClassId,
      fromAcademicYearId: currentEnrollment.academicYearId,
      toAcademicYearId: currentEnrollment.academicYearId,
      reason: dto.reason || 'Class Stream Switch',
      notes: dto.notes || `Transferred from ${fromClassId} to ${dto.targetClassId}`,
      actorUserId,
      effectiveDate: new Date(),
      createdAt: new Date(),
    };
    this.prisma.memoryStore.studentLifecycleEvents.set(lifecycleEventId, lifecycleEvent);

    this.logger.log(`Student ${student.admissionNumber} transferred from class ${fromClassId} to ${dto.targetClassId}`);
    return { student, newEnrollment, lifecycleEvent };
  }

  async transferCampus(
    tenantId: string,
    studentId: string,
    actorUserId: string,
    dto: TransferStudentCampusDto,
  ) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    const targetCampus = this.prisma.memoryStore.campuses.get(dto.targetCampusId);
    if (!targetCampus || targetCampus.tenantId !== tenantId) {
      throw new NotFoundException(`Target campus ${dto.targetCampusId} not found in this school`);
    }

    const targetClass = this.prisma.memoryStore.classes.get(dto.targetClassId);
    if (!targetClass || targetClass.tenantId !== tenantId) {
      throw new NotFoundException(`Target class ${dto.targetClassId} not found in target campus`);
    }

    const currentEnrollment = Array.from(this.prisma.memoryStore.enrollments.values()).find(
      (e: any) => e.tenantId === tenantId && e.studentId === studentId && e.status === 'ACTIVE',
    );

    const fromCampusId = student.campusId;
    const fromClassId = currentEnrollment ? currentEnrollment.classId : null;
    const academicYearId = currentEnrollment ? currentEnrollment.academicYearId : targetClass.academicYearId;

    if (currentEnrollment) {
      currentEnrollment.status = 'TRANSFERRED';
      currentEnrollment.completedAt = new Date();
      this.prisma.memoryStore.enrollments.set(currentEnrollment.id, currentEnrollment);
    }

    student.campusId = dto.targetCampusId;
    student.updatedAt = new Date();
    this.prisma.memoryStore.students.set(student.id, student);

    const newEnrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newEnrollment = {
      id: newEnrollmentId,
      tenantId,
      studentId,
      classId: dto.targetClassId,
      academicYearId,
      rollNumber: dto.rollNumber || null,
      status: 'ACTIVE',
      enrolledAt: new Date(),
    };
    this.prisma.memoryStore.enrollments.set(newEnrollmentId, newEnrollment);

    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = {
      id: lifecycleEventId,
      tenantId,
      studentId,
      eventType: 'CAMPUS_TRANSFER',
      fromCampusId,
      toCampusId: dto.targetCampusId,
      fromClassId,
      toClassId: dto.targetClassId,
      fromAcademicYearId: academicYearId,
      toAcademicYearId: academicYearId,
      reason: dto.reason || 'Inter-Campus Relocation',
      notes: dto.notes || `Relocated to campus ${targetCampus.name}`,
      actorUserId,
      effectiveDate: new Date(),
      createdAt: new Date(),
    };
    this.prisma.memoryStore.studentLifecycleEvents.set(lifecycleEventId, lifecycleEvent);

    this.logger.log(`Student ${student.admissionNumber} transferred from campus ${fromCampusId} to ${dto.targetCampusId}`);
    return { student, newEnrollment, lifecycleEvent };
  }
}
