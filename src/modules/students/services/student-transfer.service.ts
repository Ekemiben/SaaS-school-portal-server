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
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status !== 'ACTIVE') {
      throw new BadRequestException(`Cannot transfer student in "${student.status}" status.`);
    }

    const targetClass = await this.prisma.class.findFirst({
      where: { id: dto.targetClassId, tenantId },
    });
    if (!targetClass) {
      throw new NotFoundException(`Target class ${dto.targetClassId} not found`);
    }

    const currentEnrollment = await this.prisma.enrollment.findFirst({
      where: { tenantId, studentId, status: 'ACTIVE' },
    });

    if (!currentEnrollment) {
      throw new BadRequestException('Student does not have an active enrollment to transfer from.');
    }

    if (currentEnrollment.classId === dto.targetClassId) {
      throw new BadRequestException('Student is already in the target class.');
    }

    const fromClassId = currentEnrollment.classId;
    await this.prisma.enrollment.update({
      where: { id: currentEnrollment.id },
      data: {
        status: 'TRANSFERRED',
        completedAt: new Date(),
      },
    });

    const newEnrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newEnrollment = await this.prisma.enrollment.create({
      data: {
        id: newEnrollmentId,
        tenantId,
        studentId,
        classId: dto.targetClassId,
        academicYearId: currentEnrollment.academicYearId,
        rollNumber: dto.rollNumber || currentEnrollment.rollNumber,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      },
    });

    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = await this.prisma.studentLifecycleEvent.create({
      data: {
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
      },
    });

    this.logger.log(`Student ${student.admissionNumber} transferred from class ${fromClassId} to ${dto.targetClassId}`);
    return { student, newEnrollment, lifecycleEvent };
  }

  async transferCampus(
    tenantId: string,
    studentId: string,
    actorUserId: string,
    dto: TransferStudentCampusDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    const targetCampus = await this.prisma.campus.findFirst({
      where: { id: dto.targetCampusId, tenantId },
    });
    if (!targetCampus) {
      throw new NotFoundException(`Target campus ${dto.targetCampusId} not found in this school`);
    }

    const targetClass = await this.prisma.class.findFirst({
      where: { id: dto.targetClassId, tenantId },
    });
    if (!targetClass) {
      throw new NotFoundException(`Target class ${dto.targetClassId} not found in target campus`);
    }

    const currentEnrollment = await this.prisma.enrollment.findFirst({
      where: { tenantId, studentId, status: 'ACTIVE' },
    });

    const fromCampusId = student.campusId;
    const fromClassId = currentEnrollment ? currentEnrollment.classId : null;
    const academicYearId = currentEnrollment ? currentEnrollment.academicYearId : targetClass.academicYearId;

    if (currentEnrollment) {
      await this.prisma.enrollment.update({
        where: { id: currentEnrollment.id },
        data: {
          status: 'TRANSFERRED',
          completedAt: new Date(),
        },
      });
    }

    const updatedStudent = await this.prisma.student.update({
      where: { id: student.id },
      data: { campusId: dto.targetCampusId },
    });

    const newEnrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newEnrollment = await this.prisma.enrollment.create({
      data: {
        id: newEnrollmentId,
        tenantId,
        studentId,
        classId: dto.targetClassId,
        academicYearId,
        rollNumber: dto.rollNumber || null,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      },
    });

    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = await this.prisma.studentLifecycleEvent.create({
      data: {
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
      },
    });

    this.logger.log(`Student ${student.admissionNumber} transferred from campus ${fromCampusId} to ${dto.targetCampusId}`);
    return { student: updatedStudent, newEnrollment, lifecycleEvent };
  }
}
