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
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    if (student.status !== 'ACTIVE') {
      throw new BadRequestException(`Cannot promote student in "${student.status}" state. Student must be ACTIVE.`);
    }

    const currentEnrollment = await this.prisma.enrollment.findFirst({
      where: { tenantId, studentId, status: 'ACTIVE' },
    });

    const fromClassId = currentEnrollment ? currentEnrollment.classId : null;
    const fromAcademicYearId = currentEnrollment ? currentEnrollment.academicYearId : null;

    if (currentEnrollment) {
      await this.prisma.enrollment.update({
        where: { id: currentEnrollment.id },
        data: {
          status: dto.promotionType === 'REPEATED' ? 'REPEATED' : 'PROMOTED',
        },
      });
    }

    const newEnrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const newEnrollment = await this.prisma.enrollment.create({
      data: {
        id: newEnrollmentId,
        tenantId,
        studentId,
        classId: dto.targetClassId,
        academicYearId: dto.targetAcademicYearId,
        rollNumber: dto.rollNumber || (currentEnrollment ? currentEnrollment.rollNumber : null),
        status: 'ACTIVE',
        enrolledAt: new Date(),
      },
    });

    const eventType = dto.promotionType === 'REPEATED' ? 'DEMOTION' : 'PROMOTION';
    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = await this.prisma.studentLifecycleEvent.create({
      data: {
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
      },
    });

    this.logger.log(`Student ${student.admissionNumber} promoted from ${fromClassId} to ${dto.targetClassId}`);
    return { student, newEnrollment, lifecycleEvent };
  }

  async batchPromoteClass(
    tenantId: string,
    actorUserId: string,
    dto: BatchPromoteClassDto,
  ) {
    const sourceEnrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId,
        classId: dto.sourceClassId,
        academicYearId: dto.sourceAcademicYearId,
        status: 'ACTIVE',
      },
    });

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
        await this.prisma.enrollment.update({
          where: { id: currEnr.id },
          data: { status: 'PROMOTED' },
        });

        const newEnrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
        await this.prisma.enrollment.create({
          data: {
            id: newEnrollmentId,
            tenantId,
            studentId,
            classId: targetClassId,
            academicYearId: dto.targetAcademicYearId,
            rollNumber: customDecision?.rollNumber || currEnr.rollNumber,
            status: 'ACTIVE',
            enrolledAt: new Date(),
          },
        });
      } else if (decision === 'REPEATED') {
        repeatedCount++;
        await this.prisma.enrollment.update({
          where: { id: currEnr.id },
          data: { status: 'REPEATED' },
        });

        const newEnrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
        await this.prisma.enrollment.create({
          data: {
            id: newEnrollmentId,
            tenantId,
            studentId,
            classId: dto.sourceClassId,
            academicYearId: dto.targetAcademicYearId,
            rollNumber: customDecision?.rollNumber || currEnr.rollNumber,
            status: 'ACTIVE',
            enrolledAt: new Date(),
          },
        });
      } else if (decision === 'WITHDRAWN') {
        withdrawnCount++;
        await this.prisma.enrollment.update({
          where: { id: currEnr.id },
          data: { status: 'WITHDRAWN' },
        });

        await this.prisma.student.update({
          where: { id: studentId },
          data: { status: 'INACTIVE' },
        });
      }

      const eventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
      await this.prisma.studentLifecycleEvent.create({
        data: {
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
        },
      });
    }

    const batch = await this.prisma.promotionBatch.create({
      data: {
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
        criteria: dto.minPassPercentage ? { minPassPercentage: dto.minPassPercentage } : undefined,
        notes: dto.notes || null,
      },
    });

    this.logger.log(`Promotion batch ${batchId} completed: ${promotedCount} promoted, ${repeatedCount} repeated, ${withdrawnCount} withdrawn.`);
    return { batch, ...batch };
  }

  async revertPromotionBatch(tenantId: string, actorUserId: string, dto: RevertPromotionBatchDto) {
    const batch = await this.prisma.promotionBatch.findFirst({
      where: { id: dto.batchId, tenantId },
    });
    if (!batch) {
      throw new NotFoundException(`Promotion batch ${dto.batchId} not found`);
    }

    if (batch.status === 'REVERTED') {
      throw new BadRequestException(`Batch ${dto.batchId} has already been reverted.`);
    }

    // Revert source enrollments
    const sourceEnrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId,
        classId: batch.sourceClassId,
        academicYearId: batch.sourceAcademicYearId,
        status: { in: ['PROMOTED', 'REPEATED', 'WITHDRAWN'] },
      },
    });

    for (const enr of sourceEnrollments) {
      await this.prisma.enrollment.update({
        where: { id: enr.id },
        data: { status: 'ACTIVE' },
      });
    }

    const updatedBatch = await this.prisma.promotionBatch.update({
      where: { id: batch.id },
      data: {
        status: 'REVERTED',
        revertedAt: new Date(),
        revertedByUserId: actorUserId,
        notes: dto.reason ? `${batch.notes || ''}\nRevert reason: ${dto.reason}`.trim() : batch.notes,
      },
    });

    this.logger.log(`Promotion batch ${batch.id} was reverted by user ${actorUserId}`);
    return { revertedBatch: updatedBatch, revertedEnrollmentsCount: sourceEnrollments.length, ...updatedBatch };
  }

  async getPromotionBatches(tenantId: string, academicYearId?: string) {
    const where: any = { tenantId };
    if (academicYearId) {
      where.OR = [
        { sourceAcademicYearId: academicYearId },
        { targetAcademicYearId: academicYearId },
      ];
    }
    return this.prisma.promotionBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
