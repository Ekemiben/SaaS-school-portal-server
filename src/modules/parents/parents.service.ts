import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

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
            studentId: sp.student.id,
            name: `${sp.student.firstName} ${sp.student.lastName}`.trim(),
            admissionNumber: sp.student.admissionNumber,
            className: sp.student.enrollments?.[0]?.class?.name || 'Unassigned',
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
            studentId: sp.student.id,
            name: `${sp.student.firstName} ${sp.student.lastName}`.trim(),
            admissionNumber: sp.student.admissionNumber,
            className: sp.student.enrollments?.[0]?.class?.name || 'Unassigned',
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

    if (this.prisma.isDbConnected) {
      try {
        const dbParent = await this.prisma.parent.create({
          data: {
            id,
            tenantId,
            firstName,
            lastName,
            email: data.email ? data.email.toLowerCase().trim() : null,
            phone: data.phone,
            relationship: data.relationship || 'Parent',
            occupation: data.occupation || null,
            address: data.address || null,
          },
        });
        return { ...dbParent, fullName };
      } catch {}
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
      linkedWards: data.linkedWards || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.parents.set(id, parent);
    return parent;
  }

  async update(tenantId: string, parentId: string, data: any) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.parent.updateMany({
          where: { id: parentId, tenantId },
          data: {
            ...(data.firstName ? { firstName: data.firstName } : {}),
            ...(data.lastName ? { lastName: data.lastName } : {}),
            ...(data.email ? { email: data.email.toLowerCase().trim() } : {}),
            ...(data.phone ? { phone: data.phone } : {}),
            ...(data.relationship ? { relationship: data.relationship } : {}),
            ...(data.occupation ? { occupation: data.occupation } : {}),
            ...(data.address ? { address: data.address } : {}),
          },
        });
        return this.findById(tenantId, parentId);
      } catch {}
    }

    const parent = await this.findById(tenantId, parentId);
    Object.assign(parent, data, { updatedAt: new Date() });
    if (data.firstName || data.lastName) {
      parent.fullName = `${parent.firstName || ''} ${parent.lastName || ''}`.trim();
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
            { email: user.email },
            ...(user.phone ? [{ phone: user.phone }] : []),
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

      const wards = parent.students.map((sp) => {
        const s = sp.student;
        const totalAttendance = s.attendance.length;
        const presentCount = s.attendance.filter((a) => a.status === 'PRESENT').length;
        const attendancePercentage =
          totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 100;

        const totalInvoiced = s.invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const totalPaid = s.invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
        const balanceDue = s.invoices.reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);

        return {
          id: s.id,
          admissionNumber: s.admissionNumber,
          firstName: s.firstName,
          lastName: s.lastName,
          fullName: `${s.firstName} ${s.lastName}`.trim(),
          photoUrl: s.photoUrl,
          campus: s.campus?.name || 'Main Campus',
          className: s.enrollments?.[0]?.class?.name || 'Unassigned',
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

      return {
        parent: {
          id: parent.id,
          firstName: parent.firstName,
          lastName: parent.lastName,
          fullName: `${parent.firstName} ${parent.lastName}`.trim(),
          phone: parent.phone,
          email: parent.email,
          relationship: parent.relationship,
        },
        wards,
        summary: {
          totalWards: wards.length,
          totalOutstanding,
          isAllSettled: totalOutstanding <= 0,
        },
      };
    }

    return {
      parent: {
        id: 'par_mock',
        firstName: 'Parent',
        lastName: 'Guardian',
        fullName: 'Parent Guardian',
        phone: '+2348107914902',
        email: 'parent@school.edu.ng',
        relationship: 'Parent',
      },
      wards: [
        {
          id: 'std_mock_01',
          admissionNumber: 'SCH/2026/001',
          fullName: 'John Sylvester',
          campus: 'Main Campus',
          className: 'JSS 1 Gold',
          attendance: { totalDays: 60, presentDays: 58, percentage: 96 },
          fees: { totalInvoiced: 120000, totalPaid: 120000, balanceDue: 0, isSettled: true, invoicesCount: 1, invoices: [] },
        },
      ],
      summary: { totalWards: 1, totalOutstanding: 0, isAllSettled: true },
    };
  }
}
