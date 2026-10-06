import { Injectable, NotFoundException, ForbiddenException, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { ReportCardService } from '../results/services/report-card.service.js';
import { AcademicSummaryService } from '../results/services/academic-summary.service.js';
import { ParentLiveTrackingService } from '../transport/parent-live-tracking.service.js';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';

@Injectable()
export class ParentsService {
  private readonly logger = new Logger(ParentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => ReportCardService)) private readonly reportCardService?: ReportCardService,
    @Optional() @Inject(forwardRef(() => AcademicSummaryService)) private readonly academicSummaryService?: AcademicSummaryService,
    @Optional() @Inject(forwardRef(() => ParentLiveTrackingService)) private readonly parentLiveTrackingService?: ParentLiveTrackingService,
  ) {}

  /**
   * Authoritative helper to provision or link a User record with role PARENT
   * in PostgreSQL for a given Parent contact profile.
   */
  async provisionOrLinkParentUser(
    tenantId: string,
    params: {
      firstName: string;
      lastName: string;
      email?: string | null;
      phone?: string | null;
      password?: string;
    },
  ): Promise<string | null> {
    const cleanEmail = params.email ? params.email.toLowerCase().trim() : null;
    const cleanPhone = params.phone ? params.phone.replace(/\s+/g, '').trim() : null;

    if (!cleanEmail && !cleanPhone) return null;

    try {
      let role = await this.prisma.role.findFirst({
        where: { tenantId, name: 'PARENT' },
      });
      if (!role) {
        role = await this.prisma.role.create({
          data: {
            id: `role_parent_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
            tenantId,
            name: 'PARENT',
            description: 'Parent or Guardian with student ward portal access',
            isSystem: true,
          },
        });
      }

      const existingUser = await this.prisma.user.findFirst({
        where: {
          tenantId,
          OR: [
            ...(cleanEmail ? [{ email: cleanEmail }] : []),
            ...(cleanPhone ? [{ phone: cleanPhone }] : []),
          ],
        },
      });

      if (existingUser) {
        await this.prisma.userRole.upsert({
          where: {
            userId_roleId: {
              userId: existingUser.id,
              roleId: role.id,
            },
          },
          create: {
            id: `ur_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            userId: existingUser.id,
            roleId: role.id,
          },
          update: {},
        });
        return existingUser.id;
      }

      const passwordToHash = params.password || randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(passwordToHash, 10);
      const newUserId = `usr_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      const userEmail = cleanEmail || `${cleanPhone || randomUUID().substring(0, 8)}@parent.portal`;

      const newUser = await this.prisma.user.create({
        data: {
          id: newUserId,
          tenantId,
          email: userEmail,
          phone: cleanPhone,
          firstName: params.firstName,
          lastName: params.lastName,
          passwordHash,
          isActive: true,
          userRoles: {
            create: {
              id: `ur_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
              roleId: role.id,
            },
          },
        },
      });

      return newUser.id;
    } catch (err: any) {
      this.logger.warn(`Failed to provision/link parent user: ${err.message}`);
      return null;
    }
  }

  async findAll(tenantId: string) {
    const parents = await this.prisma.parent.findMany({
      where: { tenantId },
      include: {
        students: {
          include: {
            student: {
              include: {
                campus: true,
                enrollments: {
                  where: { status: 'ACTIVE' },
                  include: { class: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return parents.map((p) => ({
      id: p.id,
      userId: p.userId,
      tenantId: p.tenantId,
      firstName: p.firstName,
      lastName: p.lastName,
      fullName: `${p.firstName} ${p.lastName}`.trim(),
      email: p.email,
      phone: p.phone,
      relationship: p.relationship,
      occupation: p.occupation,
      address: p.address,
      linkedWards: (p.students || []).map((sp) => ({
        id: sp.student.id,
        studentId: sp.student.id,
        name: `${sp.student.firstName} ${sp.student.lastName}`.trim(),
        admissionNumber: sp.student.admissionNumber,
        className: sp.student.enrollments?.[0]?.class?.name || 'Unassigned',
        classLevel: sp.student.enrollments?.[0]?.class?.name || 'Unassigned',
        isPrimaryContact: sp.isPrimaryContact,
      })),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  async findById(tenantId: string, parentId: string) {
    const p = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      include: {
        students: {
          include: {
            student: {
              include: {
                campus: true,
                enrollments: {
                  where: { status: 'ACTIVE' },
                  include: { class: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!p) throw new NotFoundException('Parent record not found in this school');

    return {
      id: p.id,
      userId: p.userId,
      tenantId: p.tenantId,
      firstName: p.firstName,
      lastName: p.lastName,
      fullName: `${p.firstName} ${p.lastName}`.trim(),
      email: p.email,
      phone: p.phone,
      relationship: p.relationship,
      occupation: p.occupation,
      address: p.address,
      linkedWards: (p.students || []).map((sp) => ({
        id: sp.student.id,
        studentId: sp.student.id,
        name: `${sp.student.firstName} ${sp.student.lastName}`.trim(),
        admissionNumber: sp.student.admissionNumber,
        className: sp.student.enrollments?.[0]?.class?.name || 'Unassigned',
        classLevel: sp.student.enrollments?.[0]?.class?.name || 'Unassigned',
        isPrimaryContact: sp.isPrimaryContact,
      })),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async create(tenantId: string, data: any) {
    const id = `par_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const firstName = data.firstName || data.fullName?.split(' ')[0] || 'Parent';
    const lastName = data.lastName || data.fullName?.split(' ').slice(1).join(' ') || '';

    const candidateStudentIds: string[] = [];
    if (Array.isArray(data.studentIds)) {
      candidateStudentIds.push(...data.studentIds);
    } else if (Array.isArray(data.linkedWards)) {
      candidateStudentIds.push(
        ...data.linkedWards.map((w: any) => (typeof w === 'string' ? w : w.studentId || w.id)).filter(Boolean),
      );
    }

    const userId = await this.provisionOrLinkParentUser(tenantId, {
      firstName,
      lastName,
      email: data.email,
      phone: data.phone,
      password: data.password,
    });

    await this.prisma.parent.create({
      data: {
        id,
        tenantId,
        userId: userId || undefined,
        firstName,
        lastName,
        email: data.email ? data.email.toLowerCase().trim() : null,
        phone: data.phone ? data.phone.trim() : null,
        relationship: data.relationship || 'Parent',
        occupation: data.occupation || null,
        address: data.address || null,
      },
    });

    if (candidateStudentIds.length > 0) {
      const validStudents = await this.prisma.student.findMany({
        where: { tenantId, id: { in: candidateStudentIds } },
        select: { id: true },
      });

      if (validStudents.length > 0) {
        await this.prisma.studentParent.createMany({
          data: validStudents.map((s, idx) => ({
            id: `sp_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            parentId: id,
            studentId: s.id,
            isPrimaryContact: idx === 0 ? (data.isPrimaryContact ?? true) : false,
          })),
          skipDuplicates: true,
        });
      }
    }

    return this.findById(tenantId, id);
  }

  async update(tenantId: string, parentId: string, data: any) {
    const hasStudentUpdates = data.studentIds !== undefined || data.linkedWards !== undefined;
    const candidateStudentIds: string[] = [];
    if (Array.isArray(data.studentIds)) {
      candidateStudentIds.push(...data.studentIds);
    } else if (Array.isArray(data.linkedWards)) {
      candidateStudentIds.push(
        ...data.linkedWards.map((w: any) => (typeof w === 'string' ? w : w.studentId || w.id)).filter(Boolean),
      );
    }

    const existingParent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
    });

    if (!existingParent) {
      throw new NotFoundException('Parent record not found in this school');
    }

    let userId = existingParent.userId;
    if (!userId && (data.email || data.phone || existingParent.email || existingParent.phone)) {
      userId = await this.provisionOrLinkParentUser(tenantId, {
        firstName: data.firstName || existingParent.firstName,
        lastName: data.lastName || existingParent.lastName,
        email: data.email || existingParent.email,
        phone: data.phone || existingParent.phone,
        password: data.password,
      });
    } else if (userId) {
      const userUpdates: any = {};
      if (data.firstName) userUpdates.firstName = data.firstName;
      if (data.lastName) userUpdates.lastName = data.lastName;
      if (data.email) userUpdates.email = data.email.toLowerCase().trim();
      if (data.phone) userUpdates.phone = data.phone.trim();
      if (data.password) {
        userUpdates.passwordHash = await bcrypt.hash(data.password, 10);
      }
      if (Object.keys(userUpdates).length > 0) {
        await this.prisma.user.update({
          where: { id: userId },
          data: userUpdates,
        }).catch(() => {});
      }
    }

    await this.prisma.parent.update({
      where: { id: parentId },
      data: {
        ...(userId ? { userId } : {}),
        ...(data.firstName ? { firstName: data.firstName } : {}),
        ...(data.lastName ? { lastName: data.lastName } : {}),
        ...(data.email ? { email: data.email.toLowerCase().trim() } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.relationship ? { relationship: data.relationship } : {}),
        ...(data.occupation ? { occupation: data.occupation } : {}),
        ...(data.address ? { address: data.address } : {}),
      },
    });

    if (hasStudentUpdates) {
      const validStudents = await this.prisma.student.findMany({
        where: { tenantId, id: { in: candidateStudentIds } },
        select: { id: true },
      });
      const validIds = validStudents.map((s) => s.id);

      await this.prisma.studentParent.deleteMany({
        where: {
          parentId,
          studentId: { notIn: validIds },
        },
      });

      const existingLinks = await this.prisma.studentParent.findMany({
        where: { parentId },
        select: { studentId: true },
      });
      const existingIds = new Set(existingLinks.map((sp) => sp.studentId));

      const toAdd = validIds.filter((sid) => !existingIds.has(sid));
      if (toAdd.length > 0) {
        await this.prisma.studentParent.createMany({
          data: toAdd.map((sid, idx) => ({
            id: `sp_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            parentId,
            studentId: sid,
            isPrimaryContact: existingIds.size === 0 && idx === 0,
          })),
          skipDuplicates: true,
        });
      }
    }

    return this.findById(tenantId, parentId);
  }

  async delete(tenantId: string, parentId: string) {
    await this.prisma.parent.deleteMany({
      where: { id: parentId, tenantId },
    });
    return { success: true, message: 'Parent record removed successfully' };
  }

  async getPortalProfile(tenantId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User account not found');

    const parent = await this.prisma.parent.findFirst({
      where: {
        tenantId,
        OR: [
          { userId: user.id },
          ...(user.email ? [{ email: user.email.toLowerCase().trim() }] : []),
          ...(user.phone ? [{ phone: user.phone.trim() }] : []),
        ],
      },
      include: {
        students: {
          include: {
            student: {
              include: {
                campus: true,
                enrollments: {
                  where: { status: 'ACTIVE' },
                  include: { class: true, academicYear: true },
                  orderBy: { enrolledAt: 'desc' },
                  take: 1,
                },
                attendance: {
                  take: 50,
                  orderBy: { date: 'desc' },
                },
                invoices: {
                  include: {
                    feeStructure: true,
                    payments: {
                      where: { status: 'SUCCESSFUL' },
                      orderBy: { paidAt: 'desc' },
                    },
                  },
                  orderBy: { dueDate: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent profile not found for this account.');
    }

    if (!parent.userId) {
      await this.prisma.parent.update({
        where: { id: parent.id },
        data: { userId: user.id },
      }).catch(() => {});
    }

    // Fetch tenant-wide fee structures to attach official class fee schedules
    const tenantFeeStructures = await this.prisma.feeStructure.findMany({
      where: { tenantId, status: 'ACTIVE' },
      include: { class: true, term: true, academicYear: true },
      orderBy: { createdAt: 'desc' },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, currency: true, features: true, logoUrl: true },
    });
    const currency = tenant?.currency || 'NGN';

    const wards = parent.students.map((sp) => {
      const s = sp.student;
      const totalAttendance = s.attendance.length;
      const presentCount = s.attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;
      const attendancePercentage =
        totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 100;

      const totalInvoiced = s.invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      const totalPaid = s.invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
      const balanceDue = s.invoices.reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);

      // Exam clearance calculation (Mid-term: 50%, Final: 100%)
      const percentagePaid = totalInvoiced > 0 ? Number(((totalPaid / totalInvoiced) * 100).toFixed(1)) : 100;
      const isMidTermCleared = percentagePaid >= 50;
      const isFinalExamCleared = percentagePaid >= 100;
      const isCleared = isFinalExamCleared || (totalInvoiced === 0 && balanceDue === 0);
      const cleanAdmiss = (s.admissionNumber || s.id).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
      const clearanceToken = `CLR-${cleanAdmiss}-${Math.abs(Math.round(totalPaid || 0)).toString(16).toUpperCase()}`;

      const examClearance = {
        isCleared,
        isMidTermCleared,
        isFinalExamCleared,
        percentagePaid,
        midTermThreshold: 50,
        finalExamThreshold: 100,
        clearanceToken,
        status: isCleared ? 'CLEARED' : (isMidTermCleared ? 'MID_TERM_ONLY' : 'BLOCKED'),
        remarks: isCleared
          ? 'All fees fully settled. Candidate is fully cleared for all term examinations.'
          : isMidTermCleared
          ? 'Mid-Term payment threshold satisfied. Please settle balance before Final Examinations.'
          : `Payment threshold not met (${percentagePaid}% paid). Examination hall permit is locked until fees are settled.`,
        issuedAt: new Date().toISOString(),
      };

      const classId = s.enrollments?.[0]?.classId || s.enrollments?.[0]?.class?.id || null;
      const gradeLevel = s.enrollments?.[0]?.class?.gradeLevel;

      // Find published class fee structure
      const matchedStructure =
        tenantFeeStructures.find((f) => f.classId === classId) ||
        tenantFeeStructures.find((f) => f.applicableGradeLevel === gradeLevel) ||
        tenantFeeStructures.find((f) => !f.classId && !f.applicableGradeLevel) ||
        null;

      const feeSchedule = matchedStructure
        ? {
            id: matchedStructure.id,
            name: matchedStructure.name,
            totalAmount: matchedStructure.amount,
            currency: matchedStructure.currency || currency,
            termName: matchedStructure.term?.name || 'Current Term',
            sessionName: matchedStructure.academicYear?.name || 'Current Session',
            items: Array.isArray(matchedStructure.items) ? matchedStructure.items : [],
          }
        : null;

      return {
        id: s.id,
        studentId: s.id,
        admissionNumber: s.admissionNumber,
        firstName: s.firstName,
        lastName: s.lastName,
        fullName: `${s.firstName} ${s.lastName}`.trim(),
        photoUrl: s.photoUrl,
        campus: s.campus?.name || 'Main Campus',
        classId,
        className: s.enrollments?.[0]?.class?.name || 'Unassigned',
        classLevel: s.enrollments?.[0]?.class?.name || 'Unassigned',
        attendance: {
          totalDays: totalAttendance,
          presentDays: presentCount,
          percentage: attendancePercentage,
        },
        feeSchedule,
        examClearance,
        fees: {
          totalInvoiced,
          totalPaid,
          balanceDue,
          isSettled: balanceDue <= 0,
          percentagePaid,
          examClearance,
          invoicesCount: s.invoices.length,
          invoices: s.invoices.map((inv) => {
            const rawLineItems =
              Array.isArray(inv.lineItems) && inv.lineItems.length > 0
                ? inv.lineItems
                : Array.isArray(inv.feeStructure?.items)
                ? inv.feeStructure.items
                : [{ name: inv.feeStructure?.name || 'Tuition & School Levies', amount: inv.totalAmount }];

            const lineItems = rawLineItems.map((it: any) => ({
              name: it.name || it.description || 'Fee Item',
              code: it.code || 'ITEM',
              category: it.category || 'TUITION',
              amount: Number(it.amount || 0),
              isOptional: Boolean(it.isOptional),
            }));

            const payments = (inv.payments || []).map((p: any) => ({
              id: p.id,
              reference: p.reference || p.id,
              amount: Number(p.amount || 0),
              paidAt: p.paidAt ? p.paidAt.toISOString().split('T')[0] : p.createdAt.toISOString().split('T')[0],
              channel: p.provider || 'Online Gateway',
              status: p.status,
            }));

            return {
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              totalAmount: inv.totalAmount,
              paidAmount: inv.paidAmount,
              balanceAmount: inv.balanceAmount,
              subtotal: inv.subtotal || inv.totalAmount,
              discountAmount: inv.discountAmount || 0,
              waiverAmount: inv.waiverAmount || 0,
              latePenaltyAmount: inv.latePenaltyAmount || 0,
              currency: inv.currency || currency,
              status: inv.status,
              dueDate: inv.dueDate,
              issuedAt: inv.createdAt,
              lineItems,
              payments,
            };
          }),
        },
      };
    });

    const totalOutstanding = wards.reduce((sum, w) => sum + w.fees.balanceDue, 0);
    const paymentConfig = (tenant?.features as any)?.paymentConfig || {};

    return {
      parent: {
        id: parent.id,
        userId: parent.userId || user.id,
        firstName: parent.firstName,
        lastName: parent.lastName,
        fullName: `${parent.firstName} ${parent.lastName}`.trim(),
        phone: parent.phone,
        email: parent.email,
        relationship: parent.relationship,
        address: parent.address,
      },
      wards,
      linkedWards: wards,
      summary: {
        totalWards: wards.length,
        totalOutstanding,
        isAllSettled: totalOutstanding <= 0,
      },
      school: {
        name: tenant?.name || 'School Portal',
        currency: tenant?.currency || 'NGN',
        logoUrl: tenant?.logoUrl || null,
        bankDetails: {
          bankName: paymentConfig.bankName || null,
          accountNumber: paymentConfig.accountNumber || null,
          accountName: paymentConfig.accountName || null,
          paymentInstructions: paymentConfig.paymentInstructions || 'Please include your student admission number as transfer narration.',
        },
        paymentGateway: {
          defaultProvider: paymentConfig.defaultProvider || 'PAYSTACK',
          enableCardPayments: paymentConfig.enableCardPayments ?? true,
          enableBankTransfer: paymentConfig.enableBankTransfer ?? true,
          enableVirtualAccounts: paymentConfig.enableVirtualAccounts ?? true,
        },
      },
    };
  }

  async validateParentWardAccess(tenantId: string, userId: string, studentId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const parent = await this.prisma.parent.findFirst({
      where: {
        tenantId,
        OR: [
          { userId: userId },
          ...(user?.email ? [{ email: user.email.toLowerCase().trim() }] : []),
          ...(user?.phone ? [{ phone: user.phone.trim() }] : []),
        ],
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent profile not found for this user account.');
    }

    const link = await this.prisma.studentParent.findFirst({
      where: { parentId: parent.id, studentId },
    });

    if (!link) {
      throw new ForbiddenException('You are not authorized to access records for this student.');
    }

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      include: {
        campus: true,
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { class: true },
          take: 1,
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student record not found.');
    }

    return { parent, student };
  }

  async getWardAttendance(tenantId: string, userId: string, studentId: string, query?: any) {
    const { student } = await this.validateParentWardAccess(tenantId, userId, studentId);
    const records = await this.prisma.attendance.findMany({
      where: { tenantId, studentId },
      orderBy: { date: 'desc' },
      take: 100,
    });

    const totalDays = records.length;
    const presentDays = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const absentDays = records.filter((r) => r.status === 'ABSENT').length;
    const lateDays = records.filter((r) => r.status === 'LATE').length;
    const percentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

    return {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        admissionNumber: student.admissionNumber,
      },
      stats: {
        totalDays,
        presentDays,
        absentDays,
        lateDays,
        percentage,
      },
      records: records.map((r) => ({
        id: r.id,
        date: r.date,
        status: r.status,
        sessionType: r.sessionType || 'DAILY',
        remarks: r.remarks || null,
      })),
    };
  }

  async getWardResults(tenantId: string, userId: string, studentId: string) {
    const { student } = await this.validateParentWardAccess(tenantId, userId, studentId);
    const exams = await this.prisma.examination.findMany({
      where: { tenantId, isPublished: true },
      orderBy: { startDate: 'desc' },
    });
    const examIds = exams.map((e) => e.id);
    const results = await this.prisma.result.findMany({
      where: { tenantId, studentId, examinationId: { in: examIds } },
      include: { subject: true, examination: true },
    });

    return {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        admissionNumber: student.admissionNumber,
      },
      publishedExaminations: exams.map((e) => ({
        id: e.id,
        name: e.name,
        termId: e.termId,
        academicYearId: e.academicYearId,
        startDate: e.startDate,
        endDate: e.endDate,
      })),
      results: results.map((r) => ({
        id: r.id,
        examinationId: r.examinationId,
        examinationName: r.examination?.name || 'Term Exam',
        subjectId: r.subjectId,
        subjectName: r.subject?.name || 'Subject',
        marksObtained: r.marksObtained,
        maxMarks: r.maxMarks || 100,
        percentage: Number(((r.marksObtained / (r.maxMarks || 100)) * 100).toFixed(1)),
        grade: r.grade || 'N/A',
        remarks: r.remarks || 'Satisfactory',
        componentScores: r.componentScores || null,
      })),
    };
  }

  async getWardReportCard(tenantId: string, userId: string, studentId: string, examinationId: string) {
    await this.validateParentWardAccess(tenantId, userId, studentId);
    if (this.reportCardService) {
      return this.reportCardService.prepareReportCardData(tenantId, studentId, examinationId);
    }
    throw new NotFoundException('Report card generation service unavailable.');
  }

  async getWardTimetable(tenantId: string, userId: string, studentId: string) {
    const { student } = await this.validateParentWardAccess(tenantId, userId, studentId);
    const classId = student.enrollments?.[0]?.classId || (student as any).classId || (student as any).currentClassId;
    let entries: any[] = [];
    if (classId) {
      entries = await this.prisma.timetableEntry.findMany({
        where: { timetable: { tenantId, classId } },
        include: { subject: true, teacher: true },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
    }

    const cls = student.enrollments?.[0]?.class || (classId ? await this.prisma.class.findUnique({ where: { id: classId } }) : null);

    return {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        admissionNumber: student.admissionNumber,
      },
      class: {
        id: classId,
        name: cls?.name || 'Class',
      },
      schedule: entries.map((entry) => ({
        id: entry.id,
        dayOfWeek: entry.dayOfWeek,
        periodNumber: entry.periodNumber,
        startTime: entry.startTime,
        endTime: entry.endTime,
        subjectName: entry.subject?.name || 'General',
        teacherName: `${entry.teacher?.firstName || ''} ${entry.teacher?.lastName || ''}`.trim() || 'Teacher',
        room: entry.room || 'Main Hall',
      })),
    };
  }

  async getWardHomework(tenantId: string, userId: string, studentId: string) {
    const { student } = await this.validateParentWardAccess(tenantId, userId, studentId);
    const classId = student.enrollments?.[0]?.classId || (student as any).classId || (student as any).currentClassId;
    let assignments: any[] = [];
    if (classId) {
      assignments = await this.prisma.homework.findMany({
        where: {
          tenantId,
          classId,
          status: 'PUBLISHED',
        },
        include: {
          subject: true,
          submissions: {
            where: { studentId },
          },
        },
        orderBy: { dueDate: 'desc' },
      });
    }

    return {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        admissionNumber: student.admissionNumber,
      },
      assignments: assignments.map((h) => {
        const submission = h.submissions?.[0] || null;
        return {
          id: h.id,
          title: h.title,
          description: h.description,
          subjectName: h.subject?.name || 'Subject',
          dueDate: h.dueDate,
          maxMarks: h.maxMarks,
          attachments: h.attachments || [],
          submission: submission
            ? {
                id: submission.id,
                submittedAt: submission.submittedAt,
                score: (submission as any).score ?? submission.marksObtained,
                marksObtained: submission.marksObtained,
                status: submission.status,
                grade: submission.grade,
                feedback: submission.feedback,
                submissionText: (submission as any).submissionText || null,
                attachmentUrls: (submission as any).attachmentUrls || [],
              }
            : null,
        };
      }),
    };
  }

  async getWardStudyMaterials(tenantId: string, userId: string, studentId: string) {
    const { student } = await this.validateParentWardAccess(tenantId, userId, studentId);
    const classId = student.enrollments?.[0]?.classId || (student as any).classId || (student as any).currentClassId;
    let materials: any[] = [];
    if (classId) {
      materials = await this.prisma.studyMaterial.findMany({
        where: {
          tenantId,
          classId,
          isPublished: true,
        },
        include: {
          subject: true,
          class: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        admissionNumber: student.admissionNumber,
      },
      materials: materials.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        topic: m.topic,
        resourceType: m.resourceType,
        subjectName: m.subject?.name || 'General',
        className: m.class?.name || 'Class',
        fileUrl: m.fileUrl,
        externalUrl: m.externalUrl,
        fileSizeBytes: m.fileSizeBytes,
        mimeType: m.mimeType,
        createdAt: m.createdAt,
      })),
    };
  }

  async getWardMedical(tenantId: string, userId: string, studentId: string) {
    const { student } = await this.validateParentWardAccess(tenantId, userId, studentId);

    const studentMed = student as any;
    const profile = {
      bloodGroup: studentMed.bloodGroup || 'O+',
      genotype: studentMed.genotype || 'AA',
      allergies: studentMed.allergies ? [studentMed.allergies] : ['None Reported'],
      chronicConditions: [],
      emergencyContact: {
        name: studentMed.emergencyContactName || `${student.firstName}'s Parent`,
        phone: studentMed.emergencyContactPhone || student.phone || 'On File',
        relationship: 'Parent',
      },
      recentVisits: [],
    };

    return {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        admissionNumber: student.admissionNumber,
      },
      medicalProfile: profile,
    };
  }

  async getWardTransport(tenantId: string, userId: string, studentId: string) {
    await this.validateParentWardAccess(tenantId, userId, studentId);
    if (this.parentLiveTrackingService) {
      return this.parentLiveTrackingService.getStudentLiveTransport(tenantId, studentId, { parentUserId: userId });
    }
    return {
      hasActiveRoute: false,
      message: 'Transport tracking is not active for this student.',
    };
  }

  async getWardTranscript(tenantId: string, userId: string, studentId: string) {
    await this.validateParentWardAccess(tenantId, userId, studentId);
    if (this.academicSummaryService) {
      return this.academicSummaryService.getStudentTranscript(tenantId, studentId);
    }
    throw new NotFoundException('Academic transcript service unavailable.');
  }

  async getWardTeachers(tenantId: string, userId: string, studentId: string) {
    const { student } = await this.validateParentWardAccess(tenantId, userId, studentId);
    const activeEnrollment = student.enrollments?.find((e: any) => e.status === 'ACTIVE') || student.enrollments?.[0];
    const classId = (student as any).classId || activeEnrollment?.classId;
    if (!classId) {
      return { teachers: [] };
    }

    const teacherMap = new Map<string, any>();

    const classObj = await this.prisma.class.findFirst({
      where: { tenantId, id: classId },
      include: {
        classTeacher: {
          include: { user: true },
        },
      },
    });

    if (classObj?.classTeacher) {
      const ct = classObj.classTeacher;
      teacherMap.set(ct.id, {
        id: ct.id,
        userId: ct.userId || ct.user?.id || null,
        name: `${ct.firstName} ${ct.lastName}`.trim(),
        role: 'Class Teacher',
        isClassTeacher: true,
        subject: 'Class Teacher',
        email: ct.email || ct.user?.email || '',
        phone: ct.phone || '',
      });
    }

    const classSubjects = await this.prisma.classSubject.findMany({
      where: { tenantId, classId },
      include: {
        subject: true,
        teacher: {
          include: { user: true },
        },
      },
    });

    for (const cs of classSubjects) {
      if (cs.teacher) {
        const t = cs.teacher;
        const existing = teacherMap.get(t.id);
        const subjectName = cs.subject?.name || 'Subject';
        if (existing) {
          existing.subject = `${existing.subject}, ${subjectName}`;
        } else {
          teacherMap.set(t.id, {
            id: t.id,
            userId: t.userId || t.user?.id || null,
            name: `${t.firstName} ${t.lastName}`.trim(),
            role: 'Subject Teacher',
            isClassTeacher: false,
            subject: subjectName,
            email: t.email || t.user?.email || '',
            phone: t.phone || '',
          });
        }
      }
    }

    return {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        className: (classObj as any)?.name || '',
      },
      teachers: Array.from(teacherMap.values()),
    };
  }

  async getParentThreads(tenantId: string, userId: string) {
    const threads = await this.prisma.communicationThread.findMany({
      where: {
        tenantId,
        OR: [
          { createdById: userId },
          { participantIds: { array_contains: userId } },
        ],
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return threads.map((th) => ({
      id: th.id,
      subject: th.subject,
      createdById: th.createdById,
      participantIds: th.participantIds,
      lastMessageAt: th.lastMessageAt,
      createdAt: th.createdAt,
      messages: th.messages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderType: m.senderType,
        content: m.content,
        attachments: m.attachments,
        readBy: m.readBy,
        createdAt: m.createdAt,
        isOwn: m.senderId === userId,
      })),
    }));
  }

  async createParentThread(
    tenantId: string,
    userId: string,
    dto: {
      recipientType?: 'CLASS_TEACHER' | 'ADMIN' | 'BOTH' | 'TEACHER';
      recipientUserId?: string;
      teacherId?: string;
      studentId?: string;
      subject: string;
      message: string;
    },
  ) {
    if (!dto.subject || !dto.message) {
      throw new ForbiddenException('Subject and message content are required.');
    }

    const recipientMode = dto.recipientType || (dto.teacherId ? 'TEACHER' : 'CLASS_TEACHER');
    const targetUserIds = new Set<string>();

    if (dto.recipientUserId) {
      targetUserIds.add(dto.recipientUserId);
    }

    let studentName: string | null = null;
    let className: string | null = null;

    if (recipientMode === 'CLASS_TEACHER' || recipientMode === 'BOTH' || recipientMode === 'TEACHER') {
      if (dto.teacherId) {
        const teacher = await this.prisma.teacher.findFirst({
          where: { tenantId, id: dto.teacherId },
        });
        if (teacher?.userId) targetUserIds.add(teacher.userId);
        else if (teacher?.id) targetUserIds.add(teacher.id);
      } else if (dto.studentId) {
        const student = await this.prisma.student.findFirst({
          where: { tenantId, id: dto.studentId },
          include: {
            enrollments: {
              where: { status: 'ACTIVE' },
              include: { class: { include: { classTeacher: true } } },
              take: 1,
            },
          },
        });
        if (student) {
          studentName = `${student.firstName} ${student.lastName}`.trim();
          className = student.enrollments?.[0]?.class?.name || null;
        }
        const ct = student?.enrollments?.[0]?.class?.classTeacher;
        if (ct?.userId) targetUserIds.add(ct.userId);
        else if (ct?.id) targetUserIds.add(ct.id);
      }
    }

    if (!studentName && dto.studentId) {
      const student = await this.prisma.student.findFirst({
        where: { tenantId, id: dto.studentId },
        include: {
          enrollments: {
            where: { status: 'ACTIVE' },
            include: { class: true },
            take: 1,
          },
        },
      });
      if (student) {
        studentName = `${student.firstName} ${student.lastName}`.trim();
        className = student.enrollments?.[0]?.class?.name || null;
      }
    }

    if (recipientMode === 'ADMIN' || recipientMode === 'BOTH') {
      const admins = await this.prisma.user.findMany({
        where: {
          tenantId,
          OR: [
            {
              userRoles: {
                some: {
                  role: {
                    name: {
                      in: [
                        'Admin', 'ADMIN', 'School Admin', 'SCHOOL_ADMIN',
                        'School Owner', 'SCHOOL_OWNER', 'Administrator',
                        'Tenant Admin', 'TENANT_ADMIN', 'Super Admin',
                        'SUPER_ADMIN', 'Principal', 'PRINCIPAL', 'Owner',
                        'OWNER', 'Proprietor', 'PROPRIETOR', 'Head of School',
                        'Campus Admin', 'CAMPUS_ADMIN',
                      ],
                    },
                  },
                },
              },
            },
            { isPlatformAdmin: true },
          ],
        },
        take: 20,
      });
      for (const a of admins) {
        targetUserIds.add(a.id);
      }

      if (targetUserIds.size === 0) {
        const tenantStaff = await this.prisma.user.findMany({
          where: {
            tenantId,
            NOT: {
              userRoles: {
                some: {
                  role: {
                    name: { in: ['STUDENT', 'PARENT', 'Student', 'Parent'] },
                  },
                },
              },
            },
          },
          take: 10,
        });
        for (const s of tenantStaff) {
          targetUserIds.add(s.id);
        }
      }
    }

    const participants = [userId];
    for (const rId of targetUserIds) {
      if (rId && !participants.includes(rId)) {
        participants.push(rId);
      }
    }

    const threadId = `th_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const messageId = `msg_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const now = new Date();

    const notifTitle = `New Parent Message: ${dto.subject}${studentName ? ` [Ward: ${studentName}${className ? ` • ${className}` : ''}]` : ''}`;

    const thread = await this.prisma.communicationThread.create({
      data: {
        id: threadId,
        tenantId,
        subject: dto.subject,
        createdById: userId,
        participantIds: participants,
        lastMessageAt: now,
        messages: {
          create: {
            id: messageId,
            senderId: userId,
            senderType: 'PARENT',
            content: dto.message,
            readBy: [userId],
            createdAt: now,
          },
        },
      },
      include: { messages: true },
    });

    for (const rId of targetUserIds) {
      await this.prisma.inAppInboxItem.create({
        data: {
          id: `inb_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId,
          recipientUserId: rId,
          category: 'DIRECT_MESSAGE',
          priority: 'HIGH',
          title: notifTitle,
          message: dto.message.length > 100 ? dto.message.slice(0, 97) + '...' : dto.message,
          actionUrl: '/communications',
          isRead: false,
        },
      }).catch(() => {});
    }

    return {
      ...thread,
      studentName,
      className,
    };
  }

  async sendThreadReply(
    tenantId: string,
    userId: string,
    threadId: string,
    dto: { content: string },
  ) {
    if (!dto.content?.trim()) {
      throw new ForbiddenException('Message content cannot be empty.');
    }

    const now = new Date();
    const messageId = `msg_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const thread = await this.prisma.communicationThread.findFirst({
      where: { id: threadId, tenantId },
    });
    if (!thread) {
      throw new NotFoundException('Conversation thread not found.');
    }

    const participants = Array.isArray(thread.participantIds)
      ? (thread.participantIds as string[])
      : [];
    if (thread.createdById !== userId && !participants.includes(userId)) {
      throw new ForbiddenException('You are not a participant in this conversation.');
    }

    const message = await this.prisma.communicationMessage.create({
      data: {
        id: messageId,
        threadId,
        senderId: userId,
        senderType: 'PARENT',
        content: dto.content,
        readBy: [userId],
        createdAt: now,
      },
    });

    await this.prisma.communicationThread.update({
      where: { id: threadId },
      data: { lastMessageAt: now },
    });

    for (const pId of participants) {
      if (pId !== userId) {
        await this.prisma.inAppInboxItem.create({
          data: {
            id: `inb_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            recipientUserId: pId,
            category: 'DIRECT_MESSAGE',
            priority: 'HIGH',
            title: `Reply in: ${thread.subject}`,
            message: dto.content.length > 100 ? dto.content.slice(0, 97) + '...' : dto.content,
            actionUrl: '/parent',
            isRead: false,
          },
        }).catch(() => {});
      }
    }

    return message;
  }

  async getPortalAnnouncements(tenantId: string, userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return notifications.map((n) => ({
      id: n.id,
      tenantId: n.tenantId,
      title: n.title,
      message: n.message,
      content: n.message,
      channel: n.channel || 'Portal Noticeboard',
      priority: 'NORMAL',
      status: n.status === 'SENT' ? 'Delivered' : n.status,
      createdAt: n.createdAt,
    }));
  }
}
