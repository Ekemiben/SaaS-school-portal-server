import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  TransitionStatus,
  TransitionPathway,
  RsvpStatus,
  InquiryStatus,
  ShowcaseCategory,
} from '@prisma/client';
import {
  CreateTransitionConfigDto,
  UpdateTransitionConfigDto,
  CreateTransitionApplicationDto,
  ParentSubmitTransitionDto,
  ParentOptOutTransitionDto,
  UpdateTransitionApplicationStatusDto,
  BulkReviewTransitionDto,
  CreateTransitionBenefitDto,
  UpdateTransitionBenefitDto,
  CreateTransitionScholarshipDto,
  UpdateTransitionScholarshipDto,
  CreateTransitionEventDto,
  UpdateTransitionEventDto,
  TransitionRsvpDto,
  CreateTransitionInquiryDto,
  RespondTransitionInquiryDto,
  CreateTransitionShowcaseItemDto,
  UpdateTransitionShowcaseItemDto,
  CreateTransitionReasonDto,
  UpdateTransitionReasonDto,
} from './dto/transition.dto.js';

@Injectable()
export class TransitionService {
  private readonly logger = new Logger(TransitionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // AUDIT & NOTIFICATION HELPERS
  // ==========================================

  private async recordAuditLog(
    tenantId: string,
    actorUserId: string | undefined,
    action: string,
    resourceType: string,
    resourceId: string,
    beforeData?: any,
    afterData?: any,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: actorUserId || null,
          action,
          resourceType,
          resourceId,
          beforeData: beforeData ? JSON.parse(JSON.stringify(beforeData)) : undefined,
          afterData: afterData ? JSON.parse(JSON.stringify(afterData)) : undefined,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Audit log write failed: ${err?.message}`);
    }
  }

  private async sendInAppNotification(
    tenantId: string,
    recipientUserId: string,
    title: string,
    message: string,
    category = 'GENERAL',
    actionUrl = '/parent',
  ) {
    try {
      const id = `inbox_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await this.prisma.inAppInboxItem.create({
        data: {
          id,
          tenantId,
          recipientUserId,
          title,
          message,
          category,
          actionUrl,
          isRead: false,
        },
      });
    } catch (err: any) {
      this.logger.warn(`In-app notification write failed: ${err?.message}`);
    }
  }

  // ==========================================
  // CONFIG MANAGEMENT
  // ==========================================

  async getConfigs(tenantId: string, academicYearId?: string) {
    const where: any = { tenantId };
    if (academicYearId) {
      where.academicYearId = academicYearId;
    }

    return this.prisma.transitionConfig.findMany({
      where,
      include: {
        academicYear: { select: { id: true, name: true, isCurrent: true } },
        sourceClass: { select: { id: true, name: true, gradeLevel: true } },
        targetClass: { select: { id: true, name: true, gradeLevel: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async saveConfig(tenantId: string, dto: CreateTransitionConfigDto, actorUserId?: string) {
    const [academicYear, sourceClass, targetClass] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId, tenantId } }),
      this.prisma.class.findFirst({ where: { id: dto.sourceClassId, tenantId } }),
      this.prisma.class.findFirst({ where: { id: dto.targetClassId, tenantId } }),
    ]);

    if (!academicYear) throw new NotFoundException('Academic Year not found for this school');
    if (!sourceClass) throw new NotFoundException('Source Class not found for this school');
    if (!targetClass) throw new NotFoundException('Target Class not found for this school');

    const config = await this.prisma.transitionConfig.upsert({
      where: {
        tenantId_academicYearId_sourceClassId_targetClassId: {
          tenantId,
          academicYearId: dto.academicYearId,
          sourceClassId: dto.sourceClassId,
          targetClassId: dto.targetClassId,
        },
      },
      create: {
        tenantId,
        academicYearId: dto.academicYearId,
        sourceClassId: dto.sourceClassId,
        targetClassId: dto.targetClassId,
        applicationStartDate: dto.applicationStartDate ? new Date(dto.applicationStartDate) : null,
        applicationEndDate: dto.applicationEndDate ? new Date(dto.applicationEndDate) : null,
        earlyBirdDeadline: dto.earlyBirdDeadline ? new Date(dto.earlyBirdDeadline) : null,
        earlyBirdDiscountPercent: dto.earlyBirdDiscountPercent ?? 0,
        autoApproveEligible: dto.autoApproveEligible ?? false,
        minAttendancePercent: dto.minAttendancePercent ?? null,
        minAcademicAverage: dto.minAcademicAverage ?? null,
        requireEntranceExam: dto.requireEntranceExam ?? false,
        isActive: dto.isActive ?? true,
        settings: dto.settings ?? {},
      },
      update: {
        applicationStartDate: dto.applicationStartDate ? new Date(dto.applicationStartDate) : undefined,
        applicationEndDate: dto.applicationEndDate ? new Date(dto.applicationEndDate) : undefined,
        earlyBirdDeadline: dto.earlyBirdDeadline ? new Date(dto.earlyBirdDeadline) : undefined,
        earlyBirdDiscountPercent: dto.earlyBirdDiscountPercent ?? undefined,
        autoApproveEligible: dto.autoApproveEligible ?? undefined,
        minAttendancePercent: dto.minAttendancePercent ?? undefined,
        minAcademicAverage: dto.minAcademicAverage ?? undefined,
        requireEntranceExam: dto.requireEntranceExam ?? undefined,
        isActive: dto.isActive ?? undefined,
        settings: dto.settings ?? undefined,
      },
      include: {
        academicYear: { select: { id: true, name: true } },
        sourceClass: { select: { id: true, name: true } },
        targetClass: { select: { id: true, name: true } },
      },
    });

    await this.recordAuditLog(
      tenantId,
      actorUserId,
      'TRANSITION_CONFIG_SAVED',
      'TransitionConfig',
      config.id,
      undefined,
      config,
    );

    return config;
  }

  async updateConfig(tenantId: string, id: string, dto: UpdateTransitionConfigDto, actorUserId?: string) {
    const config = await this.prisma.transitionConfig.findFirst({
      where: { id, tenantId },
    });
    if (!config) throw new NotFoundException('Transition configuration not found');

    const updated = await this.prisma.transitionConfig.update({
      where: { id },
      data: {
        ...dto,
        applicationStartDate: dto.applicationStartDate ? new Date(dto.applicationStartDate) : undefined,
        applicationEndDate: dto.applicationEndDate ? new Date(dto.applicationEndDate) : undefined,
        earlyBirdDeadline: dto.earlyBirdDeadline ? new Date(dto.earlyBirdDeadline) : undefined,
      },
      include: {
        academicYear: { select: { id: true, name: true } },
        sourceClass: { select: { id: true, name: true } },
        targetClass: { select: { id: true, name: true } },
      },
    });

    await this.recordAuditLog(
      tenantId,
      actorUserId,
      'TRANSITION_CONFIG_UPDATED',
      'TransitionConfig',
      id,
      config,
      updated,
    );

    return updated;
  }

  // ==========================================
  // ELIGIBILITY & DASHBOARD ANALYTICS
  // ==========================================

  async syncEligibleStudents(tenantId: string, academicYearId?: string, actorUserId?: string) {
    const configWhere: any = { tenantId, isActive: true };
    if (academicYearId) {
      configWhere.academicYearId = academicYearId;
    }

    const configs = await this.prisma.transitionConfig.findMany({
      where: configWhere,
    });

    if (configs.length === 0) {
      return { message: 'No active transition configuration found for this target cycle', syncedCount: 0 };
    }

    let totalSynced = 0;

    for (const config of configs) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          tenantId,
          classId: config.sourceClassId,
          status: 'ACTIVE',
          student: { status: 'ACTIVE' },
        },
        include: {
          student: {
            include: {
              parents: {
                where: { isPrimaryContact: true },
                include: { parent: true },
              },
            },
          },
        },
      });

      for (const enrollment of enrollments) {
        const primaryParent = enrollment.student.parents[0]?.parent || null;

        const existing = await this.prisma.transitionApplication.findUnique({
          where: {
            tenantId_studentId_academicYearId: {
              tenantId,
              studentId: enrollment.studentId,
              academicYearId: config.academicYearId,
            },
          },
        });

        if (!existing) {
          const app = await this.prisma.transitionApplication.create({
            data: {
              tenantId,
              studentId: enrollment.studentId,
              parentId: primaryParent?.id || null,
              academicYearId: config.academicYearId,
              sourceClassId: config.sourceClassId,
              targetClassId: config.targetClassId,
              status: config.autoApproveEligible ? TransitionStatus.APPROVED : TransitionStatus.ELIGIBLE,
            },
          });
          totalSynced++;

          // If parent has a portal user account, notify them
          if (primaryParent?.userId) {
            await this.sendInAppNotification(
              tenantId,
              primaryParent.userId,
              'Secondary Transition Open!',
              `${enrollment.student.firstName} is eligible for secondary school progression. Explore the secondary showcase and transition benefits in your portal.`,
              'ANNOUNCEMENT',
              '/parent',
            );
          }
        }
      }
    }

    await this.recordAuditLog(
      tenantId,
      actorUserId,
      'TRANSITION_STUDENTS_SYNCED',
      'TransitionApplication',
      academicYearId || 'ALL',
      undefined,
      { syncedCount: totalSynced },
    );

    return {
      message: `Successfully synchronized eligible transition candidates`,
      syncedCount: totalSynced,
    };
  }

  async getDashboardAnalytics(tenantId: string, academicYearId?: string) {
    const where: any = { tenantId };
    if (academicYearId) {
      where.academicYearId = academicYearId;
    }

    const applications = await this.prisma.transitionApplication.findMany({
      where,
      include: {
        reason: { select: { code: true, label: true } },
        scholarship: { select: { id: true, name: true } },
      },
    });

    const statusCounts: Record<string, number> = {
      ELIGIBLE: 0,
      EXPRESSED_INTEREST: 0,
      APPLICATION_SUBMITTED: 0,
      UNDER_REVIEW: 0,
      APPROVED: 0,
      OFFER_ACCEPTED: 0,
      CONFIRMED: 0,
      NOT_CONTINUING: 0,
      WITHDRAWN: 0,
    };

    const reasonCounts: Record<string, number> = {};

    applications.forEach((app) => {
      statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
      if (app.status === TransitionStatus.NOT_CONTINUING) {
        const reasonLabel = app.reason?.label || app.notContinuingReason || 'Unspecified';
        reasonCounts[reasonLabel] = (reasonCounts[reasonLabel] || 0) + 1;
      }
    });

    const totalStudents = applications.length;
    const totalPositive =
      (statusCounts.EXPRESSED_INTEREST || 0) +
      (statusCounts.APPLICATION_SUBMITTED || 0) +
      (statusCounts.UNDER_REVIEW || 0) +
      (statusCounts.APPROVED || 0) +
      (statusCounts.OFFER_ACCEPTED || 0) +
      (statusCounts.CONFIRMED || 0);

    const retentionRate = totalStudents > 0 ? ((statusCounts.CONFIRMED / totalStudents) * 100).toFixed(1) : '0.0';
    const interestRate = totalStudents > 0 ? ((totalPositive / totalStudents) * 100).toFixed(1) : '0.0';

    return {
      totalStudents,
      statusCounts,
      reasonCounts,
      retentionRate: parseFloat(retentionRate),
      interestRate: parseFloat(interestRate),
      totalConfirmed: statusCounts.CONFIRMED || 0,
      totalNotContinuing: statusCounts.NOT_CONTINUING || 0,
    };
  }

  // ==========================================
  // APPLICATIONS (ADMIN & STAFF)
  // ==========================================

  async listApplications(
    tenantId: string,
    query: {
      academicYearId?: string;
      status?: TransitionStatus;
      sourceClassId?: string;
      targetClassId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const {
      academicYearId,
      status,
      sourceClassId,
      targetClassId,
      search,
      page = 1,
      limit = 50,
    } = query;

    const where: any = { tenantId };

    if (academicYearId) where.academicYearId = academicYearId;
    if (status) where.status = status;
    if (sourceClassId) where.sourceClassId = sourceClassId;
    if (targetClassId) where.targetClassId = targetClassId;

    if (search) {
      where.student = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { admissionNumber: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, items] = await Promise.all([
      this.prisma.transitionApplication.count({ where }),
      this.prisma.transitionApplication.findMany({
        where,
        skip,
        take,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              admissionNumber: true,
              photoUrl: true,
              gender: true,
            },
          },
          parent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          sourceClass: { select: { id: true, name: true, gradeLevel: true } },
          targetClass: { select: { id: true, name: true, gradeLevel: true } },
          academicYear: { select: { id: true, name: true } },
          scholarship: { select: { id: true, name: true, coveragePercent: true } },
          reason: { select: { id: true, code: true, label: true } },
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async getApplicationById(tenantId: string, id: string) {
    const application = await this.prisma.transitionApplication.findFirst({
      where: { id, tenantId },
      include: {
        student: {
          include: {
            parents: {
              include: { parent: true },
            },
            results: {
              take: 5,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        parent: true,
        sourceClass: true,
        targetClass: true,
        academicYear: true,
        scholarship: true,
        reason: true,
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!application) throw new NotFoundException('Transition application not found');
    return application;
  }

  async updateApplicationStatus(
    tenantId: string,
    id: string,
    dto: UpdateTransitionApplicationStatusDto,
    reviewerUserId?: string,
  ) {
    const application = await this.prisma.transitionApplication.findFirst({
      where: { id, tenantId },
      include: {
        parent: true,
        student: true,
        targetClass: true,
      },
    });
    if (!application) throw new NotFoundException('Transition application not found');

    const updateData: any = {
      status: dto.status,
      internalNotes: dto.internalNotes !== undefined ? dto.internalNotes : application.internalNotes,
      discountPercentage: dto.discountPercentage !== undefined ? dto.discountPercentage : application.discountPercentage,
      waiverAmount: dto.waiverAmount !== undefined ? dto.waiverAmount : application.waiverAmount,
      scholarshipId: dto.scholarshipId !== undefined ? dto.scholarshipId : application.scholarshipId,
      reasonId: dto.reasonId !== undefined ? dto.reasonId : application.reasonId,
      notContinuingReason: dto.notContinuingReason !== undefined ? dto.notContinuingReason : application.notContinuingReason,
      reviewedById: reviewerUserId || application.reviewedById,
      reviewedAt: new Date(),
    };

    if (dto.status === TransitionStatus.CONFIRMED) {
      updateData.confirmedAt = new Date();
    }

    const updated = await this.prisma.transitionApplication.update({
      where: { id },
      data: updateData,
      include: {
        student: true,
        sourceClass: true,
        targetClass: true,
        scholarship: true,
        reason: true,
      },
    });

    // Notify Parent in-app when approved
    if (dto.status === TransitionStatus.APPROVED && application.parent?.userId) {
      await this.sendInAppNotification(
        tenantId,
        application.parent.userId,
        'Secondary Placement Offer Approved!',
        `Good news! ${application.student.firstName}'s secondary transition application to ${application.targetClass.name} has been approved. Please review and accept the offer.`,
        'ANNOUNCEMENT',
        '/parent',
      );
    }

    // Audit Logging
    await this.recordAuditLog(
      tenantId,
      reviewerUserId,
      `TRANSITION_STATUS_${dto.status}`,
      'TransitionApplication',
      id,
      application,
      updated,
    );

    return updated;
  }

  async bulkReviewApplications(
    tenantId: string,
    dto: BulkReviewTransitionDto,
    reviewerUserId?: string,
  ) {
    const { applicationIds, status, internalNotes } = dto;

    const result = await this.prisma.transitionApplication.updateMany({
      where: {
        tenantId,
        id: { in: applicationIds },
      },
      data: {
        status,
        internalNotes: internalNotes || undefined,
        reviewedById: reviewerUserId || undefined,
        reviewedAt: new Date(),
        confirmedAt: status === TransitionStatus.CONFIRMED ? new Date() : undefined,
      },
    });

    await this.recordAuditLog(
      tenantId,
      reviewerUserId,
      `TRANSITION_BULK_REVIEW_${status}`,
      'TransitionApplication',
      'BULK',
      undefined,
      { count: result.count, applicationIds, status },
    );

    return {
      message: `Successfully updated ${result.count} transition applications to ${status}`,
      count: result.count,
    };
  }

  async confirmEnrollment(
    tenantId: string,
    applicationId: string,
    options?: { targetClassArmId?: string; applyWaiver?: boolean },
    actorUserId?: string,
  ) {
    const application = await this.prisma.transitionApplication.findFirst({
      where: { id: applicationId, tenantId },
      include: {
        student: true,
        parent: true,
        targetClass: true,
        academicYear: true,
      },
    });

    if (!application) throw new NotFoundException('Transition application not found');

    const targetClassId = options?.targetClassArmId || application.targetClassId;

    const existingEnrollment = await this.prisma.enrollment.findFirst({
      where: {
        tenantId,
        studentId: application.studentId,
        academicYearId: application.academicYearId,
      },
    });

    if (!existingEnrollment) {
      await this.prisma.enrollment.create({
        data: {
          tenantId,
          studentId: application.studentId,
          classId: targetClassId,
          academicYearId: application.academicYearId,
          enrollmentDate: new Date(),
          status: 'ACTIVE',
        },
      });
    } else {
      await this.prisma.enrollment.update({
        where: { id: existingEnrollment.id },
        data: {
          classId: targetClassId,
          status: 'ACTIVE',
        },
      });
    }

    // Apply waiver if requested and amount exists
    if (options?.applyWaiver && application.waiverAmount && application.waiverAmount > 0) {
      const feeStructure = await this.prisma.feeStructure.findFirst({
        where: {
          tenantId,
          academicYearId: application.academicYearId,
          classId: targetClassId,
          status: 'ACTIVE',
        },
      });

      if (feeStructure) {
        await this.prisma.feeWaiver.create({
          data: {
            tenantId,
            studentId: application.studentId,
            feeStructureId: feeStructure.id,
            waiverAmount: application.waiverAmount,
            reason: `Transition Benefit / Scholarship: ${application.pathway}`,
          },
        });
      }
    }

    // Update status to CONFIRMED
    const confirmed = await this.prisma.transitionApplication.update({
      where: { id: applicationId },
      data: {
        status: TransitionStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
      include: {
        student: true,
        targetClass: true,
      },
    });

    // Record Student Lifecycle Event
    try {
      await this.prisma.studentLifecycleEvent.create({
        data: {
          tenantId,
          studentId: application.studentId,
          eventType: 'TRANSITIONED_TO_SECONDARY',
          description: `Progressed from Primary to ${confirmed.targetClass.name} for Academic Year ${application.academicYear.name}`,
          metadata: {
            sourceClassId: application.sourceClassId,
            targetClassId,
            discountPercentage: application.discountPercentage,
            waiverAmount: application.waiverAmount,
          },
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to create lifecycle event: ${err?.message}`);
    }

    // In-App Notification to Parent
    if (application.parent?.userId) {
      await this.sendInAppNotification(
        tenantId,
        application.parent.userId,
        'Enrollment Confirmed!',
        `Official secondary enrollment for ${application.student.firstName} is confirmed in ${confirmed.targetClass.name}.`,
        'GENERAL',
        '/parent',
      );
    }

    // Audit Log
    await this.recordAuditLog(
      tenantId,
      actorUserId,
      'TRANSITION_ENROLLMENT_CONFIRMED',
      'TransitionApplication',
      applicationId,
      application,
      confirmed,
    );

    return confirmed;
  }

  // ==========================================
  // PARENT PORTAL OPERATIONS
  // ==========================================

  async getParentTransitions(tenantId: string, parentUserId: string) {
    const parent: any = await this.prisma.parent.findFirst({
      where: { tenantId, userId: parentUserId },
      include: {
        students: {
          include: {
            student: {
              include: {
                enrollments: {
                  where: { status: 'ACTIVE' },
                  include: { class: true, academicYear: true },
                  orderBy: { enrolledAt: 'desc' },
                },
                transitionApplications: {
                  include: {
                    sourceClass: true,
                    targetClass: true,
                    academicYear: true,
                    scholarship: true,
                    reason: true,
                  },
                  orderBy: { createdAt: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      return { parentFound: false, wards: [] };
    }

    const wardsWithTransitions = await Promise.all(
      parent.students.map(async (sp: any) => {
        const student = sp.student;
        let currentEnrollment = student.enrollments[0] || null;

        // Fallback to latest enrollment if no active enrollment flag is present
        if (!currentEnrollment) {
          currentEnrollment = await this.prisma.enrollment.findFirst({
            where: { tenantId, studentId: student.id },
            include: { class: true, academicYear: true },
            orderBy: { enrolledAt: 'desc' },
          });
        }

        const latestTransition = student.transitionApplications[0] || null;

        let eligibleConfig: any = null;
        if (currentEnrollment) {
          eligibleConfig = await this.prisma.transitionConfig.findFirst({
            where: {
              tenantId,
              sourceClassId: currentEnrollment.classId,
              isActive: true,
            },
            include: {
              targetClass: true,
              academicYear: true,
            },
          });
        }

        // Fallback: check config by previous transition record if enrollment is absent or promoted
        if (!eligibleConfig && latestTransition?.sourceClassId) {
          eligibleConfig = await this.prisma.transitionConfig.findFirst({
            where: {
              tenantId,
              sourceClassId: latestTransition.sourceClassId,
              isActive: true,
            },
            include: {
              targetClass: true,
              academicYear: true,
            },
          });
        }

        return {
          studentId: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          admissionNumber: student.admissionNumber,
          photoUrl: student.photoUrl,
          currentClass: currentEnrollment?.class || latestTransition?.sourceClass || null,
          currentAcademicYear: currentEnrollment?.academicYear || latestTransition?.academicYear || null,
          transitionApplication: latestTransition,
          eligibleConfig,
          isEligible: !!eligibleConfig || !!latestTransition,
        };
      }),
    );

    return {
      parentFound: true,
      parentId: parent.id,
      wards: wardsWithTransitions,
    };
  }

  async parentSubmitApplication(
    tenantId: string,
    parentUserId: string,
    dto: ParentSubmitTransitionDto,
  ) {
    const parent = await this.prisma.parent.findFirst({
      where: { tenantId, userId: parentUserId },
    });
    if (!parent) throw new NotFoundException('Parent profile not found');

    const relationship = await this.prisma.studentParent.findFirst({
      where: { parentId: parent.id, studentId: dto.studentId },
    });
    if (!relationship) throw new ForbiddenException('Not authorized for this student');

    let enrollment = await this.prisma.enrollment.findFirst({
      where: { tenantId, studentId: dto.studentId, status: 'ACTIVE' },
      include: { class: true },
      orderBy: { enrolledAt: 'desc' },
    });
    if (!enrollment) {
      enrollment = await this.prisma.enrollment.findFirst({
        where: { tenantId, studentId: dto.studentId },
        include: { class: true },
        orderBy: { enrolledAt: 'desc' },
      });
    }
    if (!enrollment) throw new BadRequestException('Student has no enrollment history');

    let config = await this.prisma.transitionConfig.findFirst({
      where: {
        tenantId,
        sourceClassId: enrollment.classId,
        isActive: true,
      },
    });
    if (!config) {
      const existingApp = await this.prisma.transitionApplication.findFirst({
        where: { tenantId, studentId: dto.studentId },
        orderBy: { createdAt: 'desc' },
      });
      if (existingApp) {
        config = await this.prisma.transitionConfig.findFirst({
          where: { tenantId, sourceClassId: existingApp.sourceClassId, isActive: true },
        });
      }
    }
    if (!config) throw new BadRequestException('Transition is not open for student class');

    const now = new Date();
    const isEarlyBird = config.earlyBirdDeadline ? now <= config.earlyBirdDeadline : false;
    const discountPercentage = isEarlyBird ? config.earlyBirdDiscountPercent || 0 : 0;

    const application = await this.prisma.transitionApplication.upsert({
      where: {
        tenantId_studentId_academicYearId: {
          tenantId,
          studentId: dto.studentId,
          academicYearId: config.academicYearId,
        },
      },
      create: {
        tenantId,
        studentId: dto.studentId,
        parentId: parent.id,
        academicYearId: config.academicYearId,
        sourceClassId: config.sourceClassId,
        targetClassId: config.targetClassId,
        pathway: dto.pathway || TransitionPathway.STANDARD_CONTINUATION,
        status: TransitionStatus.APPLICATION_SUBMITTED,
        scholarshipId: dto.scholarshipId || null,
        parentNotes: dto.parentNotes || null,
        isEarlyBird,
        discountPercentage,
        submittedAt: new Date(),
      },
      update: {
        parentId: parent.id,
        pathway: dto.pathway || undefined,
        status: TransitionStatus.APPLICATION_SUBMITTED,
        scholarshipId: dto.scholarshipId || undefined,
        parentNotes: dto.parentNotes || undefined,
        isEarlyBird,
        discountPercentage,
        submittedAt: new Date(),
      },
      include: {
        student: true,
        sourceClass: true,
        targetClass: true,
        scholarship: true,
      },
    });

    await this.recordAuditLog(
      tenantId,
      parentUserId,
      'PARENT_SUBMITTED_TRANSITION',
      'TransitionApplication',
      application.id,
      undefined,
      application,
    );

    return application;
  }

  async parentOptOut(
    tenantId: string,
    parentUserId: string,
    dto: ParentOptOutTransitionDto,
  ) {
    const parent = await this.prisma.parent.findFirst({
      where: { tenantId, userId: parentUserId },
    });
    if (!parent) throw new NotFoundException('Parent profile not found');

    const relationship = await this.prisma.studentParent.findFirst({
      where: { parentId: parent.id, studentId: dto.studentId },
    });
    if (!relationship) throw new ForbiddenException('Not authorized for this student');

    let enrollment = await this.prisma.enrollment.findFirst({
      where: { tenantId, studentId: dto.studentId, status: 'ACTIVE' },
      orderBy: { enrolledAt: 'desc' },
    });
    if (!enrollment) {
      enrollment = await this.prisma.enrollment.findFirst({
        where: { tenantId, studentId: dto.studentId },
        orderBy: { enrolledAt: 'desc' },
      });
    }
    if (!enrollment) throw new BadRequestException('Student has no enrollment history');

    let config = await this.prisma.transitionConfig.findFirst({
      where: { tenantId, sourceClassId: enrollment.classId, isActive: true },
    });
    if (!config) {
      const existingApp = await this.prisma.transitionApplication.findFirst({
        where: { tenantId, studentId: dto.studentId },
        orderBy: { createdAt: 'desc' },
      });
      if (existingApp) {
        config = await this.prisma.transitionConfig.findFirst({
          where: { tenantId, sourceClassId: existingApp.sourceClassId, isActive: true },
        });
      }
    }
    if (!config) throw new BadRequestException('No transition config found');

    const app = await this.prisma.transitionApplication.upsert({
      where: {
        tenantId_studentId_academicYearId: {
          tenantId,
          studentId: dto.studentId,
          academicYearId: config.academicYearId,
        },
      },
      create: {
        tenantId,
        studentId: dto.studentId,
        parentId: parent.id,
        academicYearId: config.academicYearId,
        sourceClassId: config.sourceClassId,
        targetClassId: config.targetClassId,
        status: TransitionStatus.NOT_CONTINUING,
        reasonId: dto.reasonId || null,
        notContinuingReason: dto.notContinuingReason || null,
        intendedDestination: dto.intendedDestination || null,
      },
      update: {
        status: TransitionStatus.NOT_CONTINUING,
        reasonId: dto.reasonId || undefined,
        notContinuingReason: dto.notContinuingReason || undefined,
        intendedDestination: dto.intendedDestination || undefined,
      },
    });

    await this.recordAuditLog(
      tenantId,
      parentUserId,
      'PARENT_OPT_OUT_TRANSITION',
      'TransitionApplication',
      app.id,
      undefined,
      app,
    );

    return app;
  }

  async parentAcceptOffer(tenantId: string, parentUserId: string, applicationId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { tenantId, userId: parentUserId },
    });
    if (!parent) throw new NotFoundException('Parent profile not found');

    const application = await this.prisma.transitionApplication.findFirst({
      where: { id: applicationId, tenantId, parentId: parent.id },
    });
    if (!application) throw new NotFoundException('Application not found');

    if (application.status !== TransitionStatus.APPROVED) {
      throw new BadRequestException('Offer must be APPROVED by school before acceptance');
    }

    const updated = await this.prisma.transitionApplication.update({
      where: { id: applicationId },
      data: {
        status: TransitionStatus.OFFER_ACCEPTED,
      },
    });

    await this.recordAuditLog(
      tenantId,
      parentUserId,
      'PARENT_ACCEPTED_OFFER',
      'TransitionApplication',
      applicationId,
      application,
      updated,
    );

    return updated;
  }

  // ==========================================
  // BENEFITS & SCHOLARSHIPS
  // ==========================================

  async listBenefits(tenantId: string, isActiveOnly = false) {
    const where: any = { tenantId };
    if (isActiveOnly) where.isActive = true;

    return this.prisma.transitionBenefit.findMany({
      where,
      include: {
        feeStructure: { select: { id: true, name: true, amount: true, currency: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBenefit(tenantId: string, dto: CreateTransitionBenefitDto, actorUserId?: string) {
    const benefit = await this.prisma.transitionBenefit.create({
      data: {
        tenantId,
        title: dto.title,
        description: dto.description,
        discountPercent: dto.discountPercent ?? 0,
        fixedDiscount: dto.fixedDiscount ?? 0,
        feeStructureId: dto.feeStructureId || null,
        isAutomatic: dto.isAutomatic ?? false,
        criteria: dto.criteria ?? {},
        isActive: dto.isActive ?? true,
      },
      include: { feeStructure: true },
    });

    await this.recordAuditLog(
      tenantId,
      actorUserId,
      'TRANSITION_BENEFIT_CREATED',
      'TransitionBenefit',
      benefit.id,
      undefined,
      benefit,
    );

    return benefit;
  }

  async updateBenefit(tenantId: string, id: string, dto: UpdateTransitionBenefitDto, actorUserId?: string) {
    const benefit = await this.prisma.transitionBenefit.findFirst({
      where: { id, tenantId },
    });
    if (!benefit) throw new NotFoundException('Benefit not found');

    return this.prisma.transitionBenefit.update({
      where: { id },
      data: dto,
      include: { feeStructure: true },
    });
  }

  async deleteBenefit(tenantId: string, id: string, actorUserId?: string) {
    const benefit = await this.prisma.transitionBenefit.findFirst({
      where: { id, tenantId },
    });
    if (!benefit) throw new NotFoundException('Benefit not found');

    return this.prisma.transitionBenefit.delete({ where: { id } });
  }

  async listScholarships(tenantId: string, isActiveOnly = false) {
    const where: any = { tenantId };
    if (isActiveOnly) where.isActive = true;

    return this.prisma.transitionScholarship.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createScholarship(tenantId: string, dto: CreateTransitionScholarshipDto, actorUserId?: string) {
    const scholarship = await this.prisma.transitionScholarship.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        criteria: dto.criteria,
        coveragePercent: dto.coveragePercent ?? 0,
        slotsAvailable: dto.slotsAvailable ?? null,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        isActive: dto.isActive ?? true,
      },
    });

    await this.recordAuditLog(
      tenantId,
      actorUserId,
      'TRANSITION_SCHOLARSHIP_CREATED',
      'TransitionScholarship',
      scholarship.id,
      undefined,
      scholarship,
    );

    return scholarship;
  }

  async updateScholarship(tenantId: string, id: string, dto: UpdateTransitionScholarshipDto, actorUserId?: string) {
    const scholarship = await this.prisma.transitionScholarship.findFirst({
      where: { id, tenantId },
    });
    if (!scholarship) throw new NotFoundException('Scholarship not found');

    return this.prisma.transitionScholarship.update({
      where: { id },
      data: {
        ...dto,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
    });
  }

  async deleteScholarship(tenantId: string, id: string) {
    const scholarship = await this.prisma.transitionScholarship.findFirst({
      where: { id, tenantId },
    });
    if (!scholarship) throw new NotFoundException('Scholarship not found');

    return this.prisma.transitionScholarship.delete({ where: { id } });
  }

  // ==========================================
  // EVENTS & RSVPs
  // ==========================================

  async listEvents(tenantId: string, includeUnpublished = false) {
    const where: any = { tenantId };
    if (!includeUnpublished) where.isPublished = true;

    return this.prisma.transitionEvent.findMany({
      where,
      include: {
        campus: { select: { id: true, name: true } },
        _count: { select: { rsvps: true } },
      },
      orderBy: { eventDate: 'asc' },
    });
  }

  async createEvent(tenantId: string, dto: CreateTransitionEventDto, actorUserId?: string) {
    const event = await this.prisma.transitionEvent.create({
      data: {
        tenantId,
        campusId: dto.campusId || null,
        title: dto.title,
        description: dto.description,
        eventType: dto.eventType,
        eventDate: new Date(dto.eventDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        location: dto.location,
        virtualLink: dto.virtualLink,
        capacity: dto.capacity,
        bannerUrl: dto.bannerUrl,
        isPublished: dto.isPublished ?? true,
      },
    });

    await this.recordAuditLog(
      tenantId,
      actorUserId,
      'TRANSITION_EVENT_CREATED',
      'TransitionEvent',
      event.id,
      undefined,
      event,
    );

    return event;
  }

  async updateEvent(tenantId: string, id: string, dto: UpdateTransitionEventDto) {
    const event = await this.prisma.transitionEvent.findFirst({
      where: { id, tenantId },
    });
    if (!event) throw new NotFoundException('Event not found');

    return this.prisma.transitionEvent.update({
      where: { id },
      data: {
        ...dto,
        eventDate: dto.eventDate ? new Date(dto.eventDate) : undefined,
      },
    });
  }

  async deleteEvent(tenantId: string, id: string) {
    const event = await this.prisma.transitionEvent.findFirst({
      where: { id, tenantId },
    });
    if (!event) throw new NotFoundException('Event not found');

    return this.prisma.transitionEvent.delete({ where: { id } });
  }

  async submitRsvp(tenantId: string, parentUserId: string, dto: TransitionRsvpDto) {
    const parent = await this.prisma.parent.findFirst({
      where: { tenantId, userId: parentUserId },
    });
    if (!parent) throw new NotFoundException('Parent profile not found');

    const studentId = dto.studentId || null;

    const existingRsvp = await this.prisma.transitionEventRsvp.findFirst({
      where: {
        tenantId,
        eventId: dto.eventId,
        parentId: parent.id,
        studentId,
      },
    });

    if (existingRsvp) {
      return this.prisma.transitionEventRsvp.update({
        where: { id: existingRsvp.id },
        data: {
          status: dto.status || undefined,
          guestCount: dto.guestCount ?? undefined,
          notes: dto.notes !== undefined ? dto.notes : undefined,
        },
        include: {
          event: true,
        },
      });
    }

    return this.prisma.transitionEventRsvp.create({
      data: {
        tenantId,
        eventId: dto.eventId,
        parentId: parent.id,
        studentId,
        status: dto.status || RsvpStatus.ATTENDING,
        guestCount: dto.guestCount ?? 1,
        notes: dto.notes,
      },
      include: {
        event: true,
      },
    });
  }

  async listEventRsvps(tenantId: string, eventId: string) {
    return this.prisma.transitionEventRsvp.findMany({
      where: { tenantId, eventId },
      include: {
        parent: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==========================================
  // INQUIRIES & PARENT Q&A
  // ==========================================

  async listInquiries(tenantId: string, status?: InquiryStatus, parentUserId?: string) {
    const where: any = { tenantId };
    if (status) where.status = status;

    if (parentUserId) {
      const parent = await this.prisma.parent.findFirst({ where: { tenantId, userId: parentUserId } });
      if (parent) {
        where.parentId = parent.id;
      }
    }

    return this.prisma.transitionInquiry.findMany({
      where,
      include: {
        parent: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInquiry(tenantId: string, parentUserId: string, dto: CreateTransitionInquiryDto) {
    const parent = await this.prisma.parent.findFirst({
      where: { tenantId, userId: parentUserId },
    });
    if (!parent) throw new NotFoundException('Parent profile not found');

    return this.prisma.transitionInquiry.create({
      data: {
        tenantId,
        parentId: parent.id,
        studentId: dto.studentId || null,
        subject: dto.subject,
        question: dto.question,
      },
    });
  }

  async respondToInquiry(
    tenantId: string,
    id: string,
    dto: RespondTransitionInquiryDto,
    staffUserId: string,
  ) {
    const inquiry = await this.prisma.transitionInquiry.findFirst({
      where: { id, tenantId },
      include: { parent: true },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');

    const updated = await this.prisma.transitionInquiry.update({
      where: { id },
      data: {
        response: dto.response,
        status: dto.status || InquiryStatus.ANSWERED,
        assignedToId: staffUserId,
        respondedAt: new Date(),
      },
      include: {
        parent: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (inquiry.parent?.userId) {
      await this.sendInAppNotification(
        tenantId,
        inquiry.parent.userId,
        'Counselor Response Received',
        `Your question regarding "${inquiry.subject}" has been answered by the transition team.`,
        'GENERAL',
        '/parent',
      );
    }

    return updated;
  }

  // ==========================================
  // SHOWCASE MANAGEMENT
  // ==========================================

  async listShowcaseItems(tenantId: string, category?: ShowcaseCategory, isActiveOnly = false) {
    const where: any = { tenantId };
    if (category) where.category = category;
    if (isActiveOnly) where.isActive = true;

    return this.prisma.transitionShowcaseItem.findMany({
      where,
      orderBy: [{ isFeatured: 'desc' }, { order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createShowcaseItem(tenantId: string, dto: CreateTransitionShowcaseItemDto) {
    return this.prisma.transitionShowcaseItem.create({
      data: {
        tenantId,
        category: dto.category,
        title: dto.title,
        subtitle: dto.subtitle,
        description: dto.description,
        imageUrl: dto.imageUrl,
        videoUrl: dto.videoUrl,
        badgeText: dto.badgeText,
        order: dto.order ?? 0,
        isFeatured: dto.isFeatured ?? false,
        isActive: dto.isActive ?? true,
        metadata: dto.metadata ?? {},
      },
    });
  }

  async updateShowcaseItem(tenantId: string, id: string, dto: UpdateTransitionShowcaseItemDto) {
    const item = await this.prisma.transitionShowcaseItem.findFirst({
      where: { id, tenantId },
    });
    if (!item) throw new NotFoundException('Showcase item not found');

    return this.prisma.transitionShowcaseItem.update({
      where: { id },
      data: dto,
    });
  }

  async deleteShowcaseItem(tenantId: string, id: string) {
    const item = await this.prisma.transitionShowcaseItem.findFirst({
      where: { id, tenantId },
    });
    if (!item) throw new NotFoundException('Showcase item not found');

    return this.prisma.transitionShowcaseItem.delete({ where: { id } });
  }

  // ==========================================
  // REASONS (OPT-OUT REASONS)
  // ==========================================

  async listReasons(tenantId: string, isActiveOnly = false) {
    const where: any = { tenantId };
    if (isActiveOnly) where.isActive = true;

    return this.prisma.transitionReason.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  async createReason(tenantId: string, dto: CreateTransitionReasonDto) {
    return this.prisma.transitionReason.create({
      data: {
        tenantId,
        code: dto.code.toUpperCase().trim(),
        label: dto.label,
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateReason(tenantId: string, id: string, dto: UpdateTransitionReasonDto) {
    const reason = await this.prisma.transitionReason.findFirst({
      where: { id, tenantId },
    });
    if (!reason) throw new NotFoundException('Reason not found');

    return this.prisma.transitionReason.update({
      where: { id },
      data: dto,
    });
  }

  async deleteReason(tenantId: string, id: string) {
    const reason = await this.prisma.transitionReason.findFirst({
      where: { id, tenantId },
    });
    if (!reason) throw new NotFoundException('Reason not found');

    return this.prisma.transitionReason.delete({ where: { id } });
  }
}
