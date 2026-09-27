import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';

@Injectable()
export class ParentsService {
  private readonly logger = new Logger(ParentsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
}
