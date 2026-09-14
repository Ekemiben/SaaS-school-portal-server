import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import { PromoteStudentDto, BatchPromoteClassDto, RevertPromotionBatchDto } from '../dto/promote-student.dto.js';

@Injectable()
export class StudentProgressionService {
  private readonly logger = new Logger(StudentProgressionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async promoteStudent(
    tenantId: string,
    studentId: string,
    actorUserId: string,
    dto: PromoteStudentDto,
  ) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status !== 'ACTIVE') {
      throw new BadRequestException(`Cannot promote student in "${student.status}" state. Student must be ACTIVE.`);
    }

    const currentEnrollment = Array.from(this.prisma.memoryStore.enrollments.values()).find(
      (e: any) => e.tenantId === tenantId && e.studentId === studentId && e.status === 'ACTIVE',
    );

    const fromClassId = currentEnrollment ? currentEnrollment.classId : null;
    const fromAcademicYearId = currentEnrollment ? currentEnrollment.academicYearId : null;

    if (currentEnrollment) {
      currentEnrollment.status = dto.promotionType === 'REPEATED' ? 'REPEATED' : 'PROMOTED';
      currentEnrollment.completedAt = new Date();
      this.prisma.memoryStore.enrollments.set(currentEnrollment.id, currentEnrollment);
    }

    const newEnrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newEnrollment = {
      id: newEnrollmentId,
      tenantId,
      studentId,
      classId: dto.targetClassId,
      academicYearId: dto.targetAcademicYearId,
      rollNumber: dto.rollNumber || (currentEnrollment ? currentEnrollment.rollNumber : null),
      status: 'ACTIVE',
      enrolledAt: new Date(),
    };
    this.prisma.memoryStore.enrollments.set(newEnrollmentId, newEnrollment);

    const eventType = dto.promotionType === 'REPEATED' ? 'DEMOTION' : 'PROMOTION';
    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = {
      id: lifecycleEventId,
      tenantId,
      studentId,
      eventType,
      fromCampusId: student.campusId,
      toCampusId: student.campusId,
      fromClassId,
      toClassId: dto.targetClassId,
      fromAcademicYearId,
      toAcademicYearId: dto.targetAcademicYearId,
      reason: dto.promotionType || 'Annual Academic Promotion',
      notes: dto.notes || `Promoted to ${dto.targetClassId} for Academic Year ${dto.targetAcademicYearId}`,
      actorUserId,
      effectiveDate: new Date(),
      createdAt: new Date(),
    };
    this.prisma.memoryStore.studentLifecycleEvents.set(lifecycleEventId, lifecycleEvent);

    this.logger.log(`Student ${student.admissionNumber} promoted from ${fromClassId} to ${dto.targetClassId}`);
    return { student, newEnrollment, lifecycleEvent };
  }

  async batchPromoteClass(
    tenantId: string,
    actorUserId: string,
    dto: BatchPromoteClassDto,
  ) {
    const sourceEnrollments = Array.from(this.prisma.memoryStore.enrollments.values()).filter(
      (e: any) =>
        e.tenantId === tenantId &&
        e.classId === dto.sourceClassId &&
        e.academicYearId === dto.sourceAcademicYearId &&
        e.status === 'ACTIVE',
    );

    if (sourceEnrollments.length === 0) {
      throw new BadRequestException(
        `No active student enrollments found in class ${dto.sourceClassId} for academic year ${dto.sourceAcademicYearId}`,
      );
    }

    const decisionsMap = new Map<string, any>();
    if (dto.studentDecisions) {
      dto.studentDecisions.forEach((d) => decisionsMap.set(d.studentId, d));
    }

    let promotedCount = 0;
    let repeatedCount = 0;
    let withdrawnCount = 0;
    const batchId = `pb_${randomUUID().replace(/-/g, '').substring(0, 10)}`;

    for (const currEnr of sourceEnrollments) {
      const studentId = currEnr.studentId;
      const customDecision = decisionsMap.get(studentId);

      const decision = customDecision?.decision || 'PROMOTED';
      const targetClassId = customDecision?.targetClassId || (decision === 'REPEATED' ? dto.sourceClassId : dto.defaultTargetClassId);

      if (decision === 'PROMOTED' || decision === 'ON_PROBATION') {
        promotedCount++;
        currEnr.status = 'PROMOTED';
        currEnr.completedAt = new Date();
        this.prisma.memoryStore.enrollments.set(currEnr.id, currEnr);

        const newEnrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
        this.prisma.memoryStore.enrollments.set(newEnrollmentId, {
          id: newEnrollmentId,
          tenantId,
          studentId,
          classId: targetClassId,
          academicYearId: dto.targetAcademicYearId,
          rollNumber: customDecision?.rollNumber || currEnr.rollNumber,
          status: 'ACTIVE',
          batchId,
          enrolledAt: new Date(),
        });
      } else if (decision === 'REPEATED') {
        repeatedCount++;
        currEnr.status = 'REPEATED';
        currEnr.completedAt = new Date();
        this.prisma.memoryStore.enrollments.set(currEnr.id, currEnr);

        const newEnrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
        this.prisma.memoryStore.enrollments.set(newEnrollmentId, {
          id: newEnrollmentId,
          tenantId,
          studentId,
          classId: dto.sourceClassId,
          academicYearId: dto.targetAcademicYearId,
          rollNumber: customDecision?.rollNumber || currEnr.rollNumber,
          status: 'ACTIVE',
          batchId,
          enrolledAt: new Date(),
        });
      } else if (decision === 'WITHDRAWN') {
        withdrawnCount++;
        currEnr.status = 'WITHDRAWN';
        currEnr.completedAt = new Date();
        this.prisma.memoryStore.enrollments.set(currEnr.id, currEnr);

        const student = this.prisma.memoryStore.students.get(studentId);
        if (student) {
          student.status = 'INACTIVE';
          this.prisma.memoryStore.students.set(studentId, student);
        }
      }

      const eventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
      this.prisma.memoryStore.studentLifecycleEvents.set(eventId, {
        id: eventId,
        tenantId,
        studentId,
        eventType: decision === 'REPEATED' ? 'DEMOTION' : decision === 'WITHDRAWN' ? 'WITHDRAWAL' : 'PROMOTION',
        fromCampusId: null,
        toCampusId: null,
        fromClassId: dto.sourceClassId,
        toClassId: targetClassId,
        fromAcademicYearId: dto.sourceAcademicYearId,
        toAcademicYearId: dto.targetAcademicYearId,
        reason: `Batch Promotion (${decision})`,
        notes: `Processed under Batch ${batchId}`,
        actorUserId,
        effectiveDate: new Date(),
        createdAt: new Date(),
      });
    }

    const batch = {
      id: batchId,
      tenantId,
      sourceAcademicYearId: dto.sourceAcademicYearId,
      targetAcademicYearId: dto.targetAcademicYearId,
      sourceClassId: dto.sourceClassId,
      targetClassId: dto.defaultTargetClassId,
      totalStudents: sourceEnrollments.length,
      promotedCount,
      repeatedCount,
      withdrawnCount,
      processedByUserId: actorUserId,
      status: 'COMPLETED',
      criteria: { minPassPercentage: dto.minPassPercentage },
      notes: dto.notes || null,
      revertedAt: null,
      revertedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.promotionBatches.set(batchId, batch);

    this.logger.log(`Promotion batch ${batchId} completed: ${promotedCount} promoted, ${repeatedCount} repeated, ${withdrawnCount} withdrawn.`);
    return { batch, ...batch };
  }

  async revertPromotionBatch(tenantId: string, actorUserId: string, dto: RevertPromotionBatchDto) {
    const batch = this.prisma.memoryStore.promotionBatches.get(dto.batchId);
    if (!batch || batch.tenantId !== tenantId) {
      throw new NotFoundException(`Promotion batch ${dto.batchId} not found`);
    }

    if (batch.status === 'REVERTED') {
      throw new BadRequestException(`Batch ${dto.batchId} has already been reverted.`);
    }

    // Delete created target enrollments for this batch
    const allEnrollments = Array.from(this.prisma.memoryStore.enrollments.values()).filter(
      (e: any) => e.tenantId === tenantId,
    );

    let revertedEnrollmentsCount = 0;
    for (const enr of allEnrollments) {
      if (enr.batchId === dto.batchId) {
        this.prisma.memoryStore.enrollments.delete(enr.id);
        revertedEnrollmentsCount++;
      }
      if (
        enr.classId === batch.sourceClassId &&
        enr.academicYearId === batch.sourceAcademicYearId &&
        (enr.status === 'PROMOTED' || enr.status === 'REPEATED' || enr.status === 'WITHDRAWN')
      ) {
        enr.status = 'ACTIVE';
        enr.completedAt = null;
        this.prisma.memoryStore.enrollments.set(enr.id, enr);
      }
    }

    batch.status = 'REVERTED';
    batch.revertedAt = new Date();
    batch.revertedByUserId = actorUserId;
    batch.notes = dto.reason ? `${batch.notes || ''}\nRevert reason: ${dto.reason}`.trim() : batch.notes;
    batch.updatedAt = new Date();

    this.prisma.memoryStore.promotionBatches.set(batch.id, batch);
    this.logger.log(`Promotion batch ${batch.id} was reverted by user ${actorUserId}`);
    return { revertedBatch: batch, revertedEnrollmentsCount, ...batch };
  }

  async getPromotionBatches(tenantId: string, academicYearId?: string) {
    let list = Array.from(this.prisma.memoryStore.promotionBatches.values()).filter(
      (b: any) => b.tenantId === tenantId,
    );
    if (academicYearId) {
      list = list.filter((b: any) => b.sourceAcademicYearId === academicYearId || b.targetAcademicYearId === academicYearId);
    }
    return list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}
