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
    if (!this.prisma.isDbConnected) return null;
    const cleanEmail = params.email ? params.email.toLowerCase().trim() : null;
    const cleanPhone = params.phone ? params.phone.replace(/\s+/g, '').trim() : null;

    if (!cleanEmail && !cleanPhone) return null;

    try {
      // 1. Resolve role
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

      // 2. Check if user already exists in this tenant
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
        // Ensure PARENT role exists
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

      // 3. User does not exist, provision a new User
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
    if (this.prisma.isDbConnected) {
      try {
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
      } catch {}
    }

    return Array.from(this.prisma.memoryStore.parents.values()).filter(
      (p) => p.tenantId === tenantId,
    );
  }

  async findById(tenantId: string, parentId: string) {
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
      }
    }

    const parent = this.prisma.memoryStore.parents.get(parentId);
    if (!parent || parent.tenantId !== tenantId) {
      throw new NotFoundException('Parent record not found');
    }
    return parent;
  }

  async create(tenantId: string, data: any) {
    const id = `par_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const firstName = data.firstName || data.fullName?.split(' ')[0] || 'Parent';
    const lastName = data.lastName || data.fullName?.split(' ').slice(1).join(' ') || '';
    const fullName = data.fullName || `${firstName} ${lastName}`.trim();

    // Resolve target student IDs to link
    const candidateStudentIds: string[] = [];
    if (Array.isArray(data.studentIds)) {
      candidateStudentIds.push(...data.studentIds);
    } else if (Array.isArray(data.linkedWards)) {
      candidateStudentIds.push(
        ...data.linkedWards.map((w: any) => (typeof w === 'string' ? w : w.studentId || w.id)).filter(Boolean)
      );
    }

    if (this.prisma.isDbConnected) {
      try {
        // Authoritative user account provisioning/linking
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

        // Link valid students strictly in this tenant
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
      } catch (err: any) {
        this.logger.warn(`Failed DB parent create: ${err.message}`);
      }
    }

    const parent = {
      ...data,
      id,
      tenantId,
      firstName,
      lastName,
      fullName,
      email: data.email || null,
      phone: data.phone,
      relationship: data.relationship || 'Father',
      occupation: data.occupation || null,
      address: data.address || null,
      portalAccess: data.portalAccess || 'Active',
      linkedWards: (data.linkedWards || []).map((w: any) => ({
        id: w.id || w.studentId || `std_${randomUUID().slice(0, 8)}`,
        studentId: w.studentId || w.id || `std_${randomUUID().slice(0, 8)}`,
        name: w.name || `${w.firstName || ''} ${w.lastName || ''}`.trim() || 'Student',
        className: w.className || w.classLevel || 'General',
        classLevel: w.classLevel || w.className || 'General',
        admissionNumber: w.admissionNumber || 'SCH/2026/001',
        isPrimaryContact: true,
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.parents.set(id, parent);
    return parent;
  }

  async update(tenantId: string, parentId: string, data: any) {
    // Resolve target student IDs if provided
    const hasStudentUpdates = data.studentIds !== undefined || data.linkedWards !== undefined;
    const candidateStudentIds: string[] = [];
    if (Array.isArray(data.studentIds)) {
      candidateStudentIds.push(...data.studentIds);
    } else if (Array.isArray(data.linkedWards)) {
      candidateStudentIds.push(
        ...data.linkedWards.map((w: any) => (typeof w === 'string' ? w : w.studentId || w.id)).filter(Boolean)
      );
    }

    if (this.prisma.isDbConnected) {
      try {
        const existingParent = await this.prisma.parent.findFirst({
          where: { id: parentId, tenantId },
        });

        if (existingParent) {
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
            // Synchronize User record
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
        }

        if (hasStudentUpdates) {
          const validStudents = await this.prisma.student.findMany({
            where: { tenantId, id: { in: candidateStudentIds } },
            select: { id: true },
          });
          const validIds = validStudents.map((s) => s.id);

          // Remove any links no longer in target list
          await this.prisma.studentParent.deleteMany({
            where: {
              parentId,
              studentId: { notIn: validIds },
            },
          });

          // Identify existing links
          const existingLinks = await this.prisma.studentParent.findMany({
            where: { parentId },
            select: { studentId: true },
          });
          const existingIds = new Set(existingLinks.map((sp) => sp.studentId));

          // Insert newly linked students
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
      } catch (err: any) {
        // Fallback to memoryStore
      }
    }

    const parent = await this.findById(tenantId, parentId);
    Object.assign(parent, data, { updatedAt: new Date() });
    if (data.firstName || data.lastName) {
      parent.fullName = `${parent.firstName || ''} ${parent.lastName || ''}`.trim();
    }
    if (hasStudentUpdates) {
      parent.linkedWards = candidateStudentIds.map((sid) => ({
        id: sid,
        studentId: sid,
        name: 'Student',
        className: 'General',
        classLevel: 'General',
        admissionNumber: 'SCH/2026/001',
        isPrimaryContact: true,
      }));
    }
    this.prisma.memoryStore.parents.set(parentId, parent);
    return parent;
  }

  async delete(tenantId: string, parentId: string) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.parent.deleteMany({
          where: { id: parentId, tenantId },
        });
        return { success: true, message: 'Parent record removed successfully' };
      } catch {}
    }

    await this.findById(tenantId, parentId);
    this.prisma.memoryStore.parents.delete(parentId);
    return { success: true, message: 'Parent record removed successfully' };
  }

  async getPortalProfile(tenantId: string, userId: string) {
    if (this.prisma.isDbConnected) {
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

      // Self-heal parent.userId link if missing
      if (!parent.userId) {
        try {
          await this.prisma.parent.update({
            where: { id: parent.id },
            data: { userId: user.id },
          });
        } catch {}
      }

      const wards = parent.students.map((sp) => {
        const s = sp.student;
        const totalAttendance = s.attendance.length;
        const presentCount = s.attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;
        const attendancePercentage =
          totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 100;

        const totalInvoiced = s.invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const totalPaid = s.invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
        const balanceDue = s.invoices.reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);

        return {
          id: s.id,
          studentId: s.id,
          admissionNumber: s.admissionNumber,
          firstName: s.firstName,
          lastName: s.lastName,
          fullName: `${s.firstName} ${s.lastName}`.trim(),
          photoUrl: s.photoUrl,
          campus: s.campus?.name || 'Main Campus',
          className: s.enrollments?.[0]?.class?.name || 'Unassigned',
          classLevel: s.enrollments?.[0]?.class?.name || 'Unassigned',
          attendance: {
            totalDays: totalAttendance,
            presentDays: presentCount,
            percentage: attendancePercentage,
          },
          fees: {
            totalInvoiced,
            totalPaid,
            balanceDue,
            isSettled: balanceDue <= 0,
            invoicesCount: s.invoices.length,
            invoices: s.invoices.map((inv) => ({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              totalAmount: inv.totalAmount,
              paidAmount: inv.paidAmount,
              balanceAmount: inv.balanceAmount,
              status: inv.status,
              dueDate: inv.dueDate,
            })),
          },
        };
      });

      const totalOutstanding = wards.reduce((sum, w) => sum + w.fees.balanceDue, 0);

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, currency: true, features: true, logoUrl: true },
      });
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

    const memoryParent = Array.from(this.prisma.memoryStore.parents.values()).find(
      (p: any) => p.tenantId === tenantId && (p.userId === userId || p.email === userId),
    );

    if (!memoryParent) {
      throw new NotFoundException('Parent profile not found.');
    }

    return {
      parent: memoryParent,
      wards: memoryParent.linkedWards || [],
      linkedWards: memoryParent.linkedWards || [],
      summary: {
        totalWards: (memoryParent.linkedWards || []).length,
        totalOutstanding: 0,
        isAllSettled: true,
      },
    };
  }

  async validateParentWardAccess(tenantId: string, userId: string, studentId: string) {
    let parent: any = null;
    let student: any = null;

    if (this.prisma.isDbConnected) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      parent = await this.prisma.parent.findFirst({
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

      student = await this.prisma.student.findFirst({
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
    } else {
      parent = Array.from(this.prisma.memoryStore.parents.values()).find(
        (p: any) => p.tenantId === tenantId && (p.userId === userId || p.email === userId),
      );
      if (!parent) {
        throw new NotFoundException('Parent profile not found.');
      }
      const linkedWards = parent.linkedWards || [];
      const isLinked = linkedWards.some((w: any) => w.id === studentId || w.studentId === studentId);
      if (!isLinked) {
        throw new ForbiddenException('You are not authorized to access records for this student.');
      }
      student = this.prisma.memoryStore.students.get(studentId);
    }

    if (!student) {
      throw new NotFoundException('Student record not found.');
    }

    return { parent, student };
  }

  async getWardAttendance(tenantId: string, userId: string, studentId: string, query?: any) {
    const { student } = await this.validateParentWardAccess(tenantId, userId, studentId);
    let records: any[] = [];
    if (this.prisma.isDbConnected) {
      try {
        records = await this.prisma.attendance.findMany({
          where: { tenantId, studentId },
          orderBy: { date: 'desc' },
          take: 100,
        });
      } catch {}
    }
    if (records.length === 0) {
      records = Array.from(this.prisma.memoryStore.attendance.values()).filter(
        (a: any) => a.tenantId === tenantId && a.studentId === studentId,
      );
      records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

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
    let exams: any[] = [];
    let results: any[] = [];

    if (this.prisma.isDbConnected) {
      try {
        exams = await this.prisma.examination.findMany({
          where: { tenantId, isPublished: true },
          orderBy: { startDate: 'desc' },
        });
        const examIds = exams.map((e) => e.id);
        results = await this.prisma.result.findMany({
          where: { tenantId, studentId, examinationId: { in: examIds } },
          include: { subject: true, examination: true },
        });
      } catch {}
    }
    if (exams.length === 0) {
      exams = Array.from(this.prisma.memoryStore.examinations.values()).filter(
        (e: any) => e.tenantId === tenantId && (e.isPublished || e.status === 'PUBLISHED'),
      );
      const examIds = new Set(exams.map((e) => e.id));
      results = Array.from(this.prisma.memoryStore.results.values()).filter(
        (r: any) => r.tenantId === tenantId && r.studentId === studentId && examIds.has(r.examinationId),
      );
    }

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
      results: results.map((r) => {
        const subject = r.subject || this.prisma.memoryStore.subjects?.get(r.subjectId);
        const exam = r.examination || this.prisma.memoryStore.examinations?.get(r.examinationId);
        return {
          id: r.id,
          examinationId: r.examinationId,
          examinationName: exam?.name || 'Term Exam',
          subjectId: r.subjectId,
          subjectName: subject?.name || 'Subject',
          marksObtained: r.marksObtained,
          maxMarks: r.maxMarks || 100,
          percentage: Number(((r.marksObtained / (r.maxMarks || 100)) * 100).toFixed(1)),
          grade: r.grade || 'N/A',
          remarks: r.remarks || 'Satisfactory',
          componentScores: r.componentScores || null,
        };
      }),
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
    const classId = student.currentClassId || student.enrollments?.[0]?.classId || student.classId;
    let entries: any[] = [];
    if (classId) {
      if (this.prisma.isDbConnected) {
        try {
          entries = await this.prisma.timetableEntry.findMany({
            where: { timetable: { tenantId, classId } },
            include: { subject: true, teacher: true },
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
          });
        } catch {}
      }
      if (entries.length === 0) {
        entries = Array.from(this.prisma.memoryStore.timetableEntries.values()).filter(
          (t: any) => t.tenantId === tenantId && t.classId === classId,
        );
      }
    }

    const cls = this.prisma.memoryStore.classes?.get(classId) || student.enrollments?.[0]?.class;

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
      schedule: entries.map((entry) => {
        const subject = entry.subject || this.prisma.memoryStore.subjects?.get(entry.subjectId);
        return {
          id: entry.id,
          dayOfWeek: entry.dayOfWeek,
          periodNumber: entry.periodNumber,
          startTime: entry.startTime,
          endTime: entry.endTime,
          subjectName: subject?.name || 'General',
          teacherName: entry.teacherName || `${entry.teacher?.firstName || ''} ${entry.teacher?.lastName || ''}`.trim() || 'Teacher',
          room: entry.room || entry.roomName || 'Main Hall',
        };
      }),
    };
  }

  async getWardHomework(tenantId: string, userId: string, studentId: string) {
    const { student } = await this.validateParentWardAccess(tenantId, userId, studentId);
    const classId = student.currentClassId || student.enrollments?.[0]?.classId || student.classId;
    let assignments: any[] = [];
    if (classId) {
      assignments = Array.from(this.prisma.memoryStore.homework.values()).filter(
        (h: any) => h.tenantId === tenantId && h.classId === classId && (h.status === 'PUBLISHED' || !h.status),
      );
    }

    return {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        admissionNumber: student.admissionNumber,
      },
      assignments: assignments.map((h) => {
        const subject = this.prisma.memoryStore.subjects?.get(h.subjectId);
        const submission = Array.from(this.prisma.memoryStore.homeworkSubmissions.values()).find(
          (s: any) => s.tenantId === tenantId && s.homeworkId === h.id && s.studentId === studentId,
        );
        return {
          id: h.id,
          title: h.title,
          description: h.description,
          subjectName: subject?.name || 'Subject',
          dueDate: h.dueDate,
          maxMarks: h.maxMarks,
          attachments: h.attachments || [],
          submission: submission
            ? {
                id: submission.id,
                submittedAt: submission.submittedAt,
                marksObtained: submission.marksObtained,
                status: submission.status,
                grade: submission.grade,
                feedback: submission.feedback,
              }
            : null,
        };
      }),
    };
  }

  async getWardMedical(tenantId: string, userId: string, studentId: string) {
    const { student } = await this.validateParentWardAccess(tenantId, userId, studentId);
    const memory = this.prisma.memoryStore as any;
    const studentVisits = Array.from(memory.clinicVisits?.values() || []).filter(
      (v: any) => v.tenantId === tenantId && (v.patientId === student.id || v.studentId === student.admissionNumber),
    );

    const profile = {
      bloodGroup: student.bloodGroup || 'O+',
      genotype: student.genotype || 'AA',
      allergies: student.allergies ? [student.allergies] : ['None Reported'],
      chronicConditions: [],
      emergencyContact: {
        name: student.emergencyContactName || `${student.firstName}'s Parent`,
        phone: student.emergencyContactPhone || student.phone || 'On File',
        relationship: 'Parent',
      },
      recentVisits: studentVisits.slice(-5),
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
    if (!student.classId) {
      return { teachers: [] };
    }

    const teacherMap = new Map<string, any>();

    if (this.prisma.isDbConnected) {
      try {
        const classObj = await this.prisma.class.findFirst({
          where: { tenantId, id: student.classId },
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
          where: { tenantId, classId: student.classId },
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
      } catch (err: any) {
        this.logger.warn(`Failed to fetch ward teachers from DB: ${err.message}`);
      }
    } else {
      const cls = this.prisma.memoryStore.classes?.get(student.classId);
      if (cls?.classTeacherId) {
        const ct = this.prisma.memoryStore.teachers?.get(cls.classTeacherId);
        if (ct) {
          teacherMap.set(ct.id, {
            id: ct.id,
            userId: ct.userId || `usr_${ct.id}`,
            name: `${ct.firstName} ${ct.lastName}`.trim(),
            role: 'Class Teacher',
            isClassTeacher: true,
            subject: 'Class Teacher',
            email: ct.email || '',
            phone: ct.phone || '',
          });
        }
      }

      const allClassSubjects = Array.from(this.prisma.memoryStore.classSubjects?.values() || []);
      for (const cs of allClassSubjects as any[]) {
        if (cs.tenantId === tenantId && cs.classId === student.classId && cs.teacherId) {
          const t = this.prisma.memoryStore.teachers?.get(cs.teacherId);
          const subj = this.prisma.memoryStore.subjects?.get(cs.subjectId);
          if (t) {
            const existing = teacherMap.get(t.id);
            const subjectName = subj?.name || 'Subject';
            if (existing) {
              existing.subject = `${existing.subject}, ${subjectName}`;
            } else {
              teacherMap.set(t.id, {
                id: t.id,
                userId: t.userId || `usr_${t.id}`,
                name: `${t.firstName} ${t.lastName}`.trim(),
                role: 'Subject Teacher',
                isClassTeacher: false,
                subject: subjectName,
                email: t.email || '',
                phone: t.phone || '',
              });
            }
          }
        }
      }
    }

    return {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        className: student.class?.name || student.assignedClass || '',
      },
      teachers: Array.from(teacherMap.values()),
    };
  }

  async getParentThreads(tenantId: string, userId: string) {
    if (this.prisma.isDbConnected) {
      try {
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

        if (threads.length > 0) {
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
      } catch (err: any) {
        this.logger.warn(`Failed to query threads from DB: ${err.message}`);
      }
    }

    const allThreads = Array.from(this.prisma.memoryStore.communicationThreads?.values() || []);
    const matching = allThreads.filter(
      (th: any) =>
        th.tenantId === tenantId &&
        (th.createdById === userId ||
          (Array.isArray(th.participantIds) && th.participantIds.includes(userId))),
    );

    matching.sort(
      (a: any, b: any) =>
        new Date(b.lastMessageAt || b.createdAt).getTime() -
        new Date(a.lastMessageAt || a.createdAt).getTime(),
    );

    const allMessages = Array.from(this.prisma.memoryStore.communicationMessages?.values() || []);

    return matching.map((th: any) => {
      const msgs = allMessages
        .filter((m: any) => m.threadId === th.id)
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return {
        id: th.id,
        subject: th.subject,
        createdById: th.createdById,
        participantIds: th.participantIds,
        lastMessageAt: th.lastMessageAt,
        createdAt: th.createdAt,
        messages: msgs.map((m: any) => ({
          id: m.id,
          senderId: m.senderId,
          senderType: m.senderType,
          content: m.content,
          attachments: m.attachments || [],
          readBy: m.readBy || [],
          createdAt: m.createdAt,
          isOwn: m.senderId === userId,
        })),
      };
    });
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

    // 1. Resolve Class Teacher / Subject Teacher recipient if requested
    if (recipientMode === 'CLASS_TEACHER' || recipientMode === 'BOTH' || recipientMode === 'TEACHER') {
      if (dto.teacherId) {
        if (this.prisma.isDbConnected) {
          const teacher = await this.prisma.teacher.findFirst({
            where: { tenantId, id: dto.teacherId },
          });
          if (teacher?.userId) targetUserIds.add(teacher.userId);
          else if (teacher?.id) targetUserIds.add(teacher.id);
        } else {
          const teacher = this.prisma.memoryStore.teachers?.get(dto.teacherId);
          if (teacher?.userId) targetUserIds.add(teacher.userId);
          else if (teacher?.id) targetUserIds.add(teacher.id);
        }
      } else if (dto.studentId) {
        // Find assigned class teacher for this student
        if (this.prisma.isDbConnected) {
          try {
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
              className = student.enrollments?.[0]?.class?.name || (student as any).currentClass || null;
            }
            const ct =
              student?.enrollments?.[0]?.class?.classTeacher ||
              (student as any)?.class?.classTeacher;
            if (ct?.userId) targetUserIds.add(ct.userId);
            else if (ct?.id) targetUserIds.add(ct.id);
          } catch (err: any) {
            this.logger.warn(`Could not resolve student teacher from DB: ${err.message}`);
          }
        }

        if (targetUserIds.size === 0) {
          const student = this.prisma.memoryStore.students?.get(dto.studentId);
          if (student) {
            studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.name || 'Student';
            const cls = student.classId ? this.prisma.memoryStore.classes?.get(student.classId) : null;
            className = cls?.name || student.currentClass || student.className || 'Class';
          }
          if (student?.classId) {
            const cls = this.prisma.memoryStore.classes?.get(student.classId);
            if (cls?.classTeacherId) {
              const ct = this.prisma.memoryStore.teachers?.get(cls.classTeacherId);
              if (ct?.userId) targetUserIds.add(ct.userId);
              else if (ct?.id) targetUserIds.add(ct.id);
            }
          } else if ((student as any)?.class?.classTeacher) {
            const ct = (student as any).class.classTeacher;
            if (ct?.userId) targetUserIds.add(ct.userId);
            else if (ct?.id) targetUserIds.add(ct.id);
          }
        }
      }
    }

    if (!studentName && dto.studentId) {
      if (this.prisma.isDbConnected) {
        try {
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
            className = student.enrollments?.[0]?.class?.name || (student as any).currentClass || null;
          }
        } catch {}
      }
      if (!studentName) {
        const memStudent = this.prisma.memoryStore.students?.get(dto.studentId);
        if (memStudent) {
          studentName = `${memStudent.firstName || ''} ${memStudent.lastName || ''}`.trim() || memStudent.name || 'Student';
          const memClass = memStudent.classId ? this.prisma.memoryStore.classes?.get(memStudent.classId) : null;
          className = memClass?.name || memStudent.currentClass || memStudent.className || null;
        }
      }
    }

    // 2. Resolve Admin recipient if requested
    if (recipientMode === 'ADMIN' || recipientMode === 'BOTH') {
      const initialSize = targetUserIds.size;
      if (this.prisma.isDbConnected) {
        try {
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
                            'Admin',
                            'ADMIN',
                            'School Admin',
                            'SCHOOL_ADMIN',
                            'School Owner',
                            'SCHOOL_OWNER',
                            'Administrator',
                            'Tenant Admin',
                            'TENANT_ADMIN',
                            'Super Admin',
                            'SUPER_ADMIN',
                            'Principal',
                            'PRINCIPAL',
                            'Owner',
                            'OWNER',
                            'Proprietor',
                            'PROPRIETOR',
                            'Head of School',
                            'Campus Admin',
                            'CAMPUS_ADMIN',
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

          // Fallback: If no explicit role matches found, resolve any tenant user that is not a student or parent
          if (targetUserIds.size === initialSize) {
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
        } catch (err: any) {
          this.logger.warn(`Could not resolve admin users in DB: ${err.message}`);
        }
      }

      if (targetUserIds.size === initialSize) {
        const adminUsers = Array.from(this.prisma.memoryStore.users?.values() || []).filter(
          (u: any) =>
            u.tenantId === tenantId &&
            u.role !== 'STUDENT' &&
            u.role !== 'PARENT' &&
            u.role !== 'Student' &&
            u.role !== 'Parent',
        );
        for (const a of adminUsers as any[]) {
          targetUserIds.add(a.id);
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

    let parentUser: any = null;
    if (this.prisma.isDbConnected) {
      try {
        parentUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      } catch {}
    }
    if (!parentUser) {
      parentUser = this.prisma.memoryStore.users?.get(userId);
    }
    const parentName = parentUser ? `${parentUser.firstName || ''} ${parentUser.lastName || ''}`.trim() : 'Parent';

    const notifTitle = `New Parent Message: ${dto.subject}${studentName ? ` [Ward: ${studentName}${className ? ` • ${className}` : ''}]` : ''}`;

    if (this.prisma.isDbConnected) {
      try {
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
          try {
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
            });
          } catch {}
        }

        return {
          ...thread,
          studentName,
          className,
        };
      } catch (err: any) {
        this.logger.warn(`Failed to create thread in DB: ${err.message}`);
      }
    }

    const threadData = {
      id: threadId,
      tenantId,
      subject: dto.subject,
      createdById: userId,
      participantIds: participants,
      studentName,
      className,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const messageData = {
      id: messageId,
      threadId,
      senderId: userId,
      senderType: 'PARENT',
      content: dto.message,
      attachments: [],
      readBy: [userId],
      createdAt: now,
    };

    this.prisma.memoryStore.communicationThreads?.set(threadId, threadData);
    this.prisma.memoryStore.communicationMessages?.set(messageId, messageData);

    for (const rId of targetUserIds) {
      const inboxId = `inb_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      this.prisma.memoryStore.inboxItems?.set(inboxId, {
        id: inboxId,
        tenantId,
        recipientUserId: rId,
        category: 'DIRECT_MESSAGE',
        priority: 'HIGH',
        title: notifTitle,
        message: dto.message.length > 100 ? dto.message.slice(0, 97) + '...' : dto.message,
        actionUrl: '/communications',
        isRead: false,
        createdAt: now,
      });
    }

    return {
      ...threadData,
      studentName,
      className,
      messages: [messageData],
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

    if (this.prisma.isDbConnected) {
      try {
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
            try {
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
              });
            } catch {}
          }
        }

        return message;
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof ForbiddenException) throw err;
        this.logger.warn(`Failed to post message reply in DB: ${err.message}`);
      }
    }

    const thread = this.prisma.memoryStore.communicationThreads?.get(threadId);
    if (!thread || thread.tenantId !== tenantId) {
      throw new NotFoundException('Conversation thread not found.');
    }

    const participants = Array.isArray(thread.participantIds) ? thread.participantIds : [];
    if (thread.createdById !== userId && !participants.includes(userId)) {
      throw new ForbiddenException('You are not a participant in this conversation.');
    }

    const messageData = {
      id: messageId,
      threadId,
      senderId: userId,
      senderType: 'PARENT',
      content: dto.content,
      attachments: [],
      readBy: [userId],
      createdAt: now,
    };

    this.prisma.memoryStore.communicationMessages?.set(messageId, messageData);
    thread.lastMessageAt = now;
    this.prisma.memoryStore.communicationThreads?.set(threadId, thread);

    for (const pId of participants) {
      if (pId !== userId) {
        const inbId = `inb_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
        this.prisma.memoryStore.inboxItems?.set(inbId, {
          id: inbId,
          tenantId,
          recipientUserId: pId,
          category: 'DIRECT_MESSAGE',
          priority: 'HIGH',
          title: `Reply in: ${thread.subject}`,
          message: dto.content.length > 100 ? dto.content.slice(0, 97) + '...' : dto.content,
          actionUrl: '/parent',
          isRead: false,
          createdAt: now,
        });
      }
    }

    return messageData;
  }

  async getPortalAnnouncements(tenantId: string, userId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const notifications = await this.prisma.notification.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
        });

        if (notifications.length > 0) {
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
      } catch (err: any) {
        this.logger.warn(`Could not load portal announcements from DB: ${err.message}`);
      }
    }

    const items = Array.from(this.prisma.memoryStore.communications?.values() || [])
      .filter(
        (c: any) =>
          c.tenantId === tenantId &&
          (!c.audience ||
            c.audience === 'ALL' ||
            c.audience === 'GENERAL' ||
            c.audience.toUpperCase().includes('PARENT') ||
            c.recipientGroup?.toUpperCase().includes('PARENT')),
      )
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return items.map((c: any) => ({
      id: c.id,
      tenantId: c.tenantId,
      title: c.title,
      message: c.message || c.content,
      content: c.content || c.message,
      channel: c.channel || 'Portal Noticeboard',
      priority: c.priority || 'NORMAL',
      status: c.status || 'Delivered',
      createdAt: c.createdAt,
    }));
  }
}



