import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import {
  CreateFeeStructureDto,
  UpdateFeeStructureDto,
  EvaluateStudentFeeDto,
} from './dto/fee-structure.dto.js';
import { FeeCalculator } from './calculator/fee-calculator.js';

@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- Fee Structures Management ---
  async getFeeStructures(
    tenantId: string,
    filters: { campusId?: string; academicYearId?: string; termId?: string; classId?: string },
  ) {
    const whereClause: any = { tenantId };
    if (filters.campusId) whereClause.campusId = filters.campusId;
    if (filters.academicYearId) whereClause.academicYearId = filters.academicYearId;
    if (filters.termId) whereClause.termId = filters.termId;
    if (filters.classId) whereClause.classId = filters.classId;

    const dbStructures = await this.prisma.feeStructure.findMany({
      where: whereClause,
      include: {
        class: true,
        term: true,
        academicYear: true,
        campus: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return dbStructures.map((f) => ({
      ...f,
      className: f.class?.name || f.applicableGradeLevel || 'All Classes',
      termName: f.term?.name || null,
      sessionName: f.academicYear?.name || null,
      campusName: f.campus?.name || null,
      items: Array.isArray(f.items) ? f.items : [],
    }));
  }

  async getFeeStructureById(tenantId: string, id: string) {
    const dbFee = await this.prisma.feeStructure.findFirst({
      where: { id, tenantId },
      include: { feeWaivers: true },
    });

    if (!dbFee) {
      throw new NotFoundException(`Fee structure '${id}' not found`);
    }

    return {
      ...dbFee,
      items: Array.isArray(dbFee.items) ? dbFee.items : [],
    };
  }

  async createFeeStructure(tenantId: string, dto: CreateFeeStructureDto) {
    const items = dto.items || [];
    const calculatedMandatoryAmount = items
      .filter((it) => !it.isOptional)
      .reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

    const totalAmount = dto.amount !== undefined ? Number(dto.amount) : calculatedMandatoryAmount;

    // Resolve campusId and academicYearId if not provided
    let campusId = dto.campusId;
    if (!campusId) {
      const firstCampus = await this.prisma.campus.findFirst({ where: { tenantId } });
      if (firstCampus) campusId = firstCampus.id;
    }
    if (!campusId) {
      const createdCampus = await this.prisma.campus.create({
        data: {
          tenantId,
          name: 'Main Campus',
          code: 'MAIN',
          isMain: true,
        },
      });
      campusId = createdCampus.id;
    }

    let academicYearId = dto.academicYearId;
    if (!academicYearId) {
      const firstAY = await this.prisma.academicYear.findFirst({ where: { tenantId } });
      if (firstAY) {
        academicYearId = firstAY.id;
      } else {
        const createdAY = await this.prisma.academicYear.create({
          data: {
            tenantId,
            name: '2026/2027 Academic Session',
            startDate: new Date(),
            endDate: new Date(Date.now() + 365 * 86400000),
            isCurrent: true,
          },
        });
        academicYearId = createdAY.id;
      }
    }

    const id = `fee_${randomUUID().replace(/-/g, '').substring(0, 10)}`;

    const created = await this.prisma.feeStructure.create({
      data: {
        id,
        tenantId,
        campusId,
        academicYearId,
        termId: dto.termId || null,
        classId: dto.classId || null,
        name: dto.name,
        code: dto.code || dto.name.toUpperCase().replace(/\s+/g, '_'),
        description: dto.description || null,
        amount: totalAmount,
        currency: dto.currency || 'NGN',
        items: items as any,
        targetAudience: dto.targetAudience || 'ALL',
        lateFeePercentage: dto.lateFeePercentage || 0,
        lateFeeGraceDays: dto.lateFeeGraceDays || 0,
        earlyBirdDiscountPercentage: dto.earlyBirdDiscountPercentage || 0,
        earlyBirdCutoffDate: dto.earlyBirdCutoffDate ? new Date(dto.earlyBirdCutoffDate) : null,
        status: 'ACTIVE',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        applicableGradeLevel: dto.applicableGradeLevel || null,
      },
    });

    return {
      ...created,
      items: Array.isArray(created.items) ? created.items : items,
    };
  }

  async updateFeeStructure(tenantId: string, id: string, dto: UpdateFeeStructureDto) {
    await this.getFeeStructureById(tenantId, id);

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.code) updateData.code = dto.code;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.termId !== undefined) updateData.termId = dto.termId;
    if (dto.classId !== undefined) updateData.classId = dto.classId;
    if (dto.applicableGradeLevel !== undefined) updateData.applicableGradeLevel = dto.applicableGradeLevel;
    if (dto.targetAudience !== undefined) updateData.targetAudience = dto.targetAudience;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.dueDate !== undefined) updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.lateFeePercentage !== undefined) updateData.lateFeePercentage = dto.lateFeePercentage;
    if (dto.lateFeeGraceDays !== undefined) updateData.lateFeeGraceDays = dto.lateFeeGraceDays;
    if (dto.earlyBirdDiscountPercentage !== undefined) updateData.earlyBirdDiscountPercentage = dto.earlyBirdDiscountPercentage;
    if (dto.earlyBirdCutoffDate !== undefined) {
      updateData.earlyBirdCutoffDate = dto.earlyBirdCutoffDate ? new Date(dto.earlyBirdCutoffDate) : null;
    }
    if (dto.items) {
      updateData.items = dto.items;
      updateData.amount = dto.items
        .filter((it) => !it.isOptional)
        .reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
    }
    updateData.updatedAt = new Date();

    const updated = await this.prisma.feeStructure.update({
      where: { id },
      data: updateData,
    });

    return {
      ...updated,
      items: Array.isArray(updated.items) ? updated.items : dto.items || [],
    };
  }

  async deleteFeeStructure(tenantId: string, id: string) {
    const fee = await this.getFeeStructureById(tenantId, id);

    await this.prisma.feeStructure.delete({
      where: { id },
    });

    return { success: true, message: `Fee structure "${fee.name}" deleted successfully` };
  }

  // --- Fee Evaluation & Student Breakdown ---
  async evaluateStudentFee(tenantId: string, dto: EvaluateStudentFeeDto) {
    const fee = await this.getFeeStructureById(tenantId, dto.feeStructureId);

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
    });

    if (!student) {
      throw new NotFoundException('Student record not found');
    }

    return FeeCalculator.evaluate({
      items: (fee.items as any) || [{ name: fee.name, code: 'BASE', amount: fee.amount, isOptional: false }],
      currency: fee.currency,
      targetAudience: fee.targetAudience,
      dueDate: fee.dueDate,
      lateFeePercentage: fee.lateFeePercentage,
      lateFeeGraceDays: fee.lateFeeGraceDays,
      earlyBirdDiscountPercentage: fee.earlyBirdDiscountPercentage,
      earlyBirdCutoffDate: fee.earlyBirdCutoffDate,
      selectedOptionalCodes: dto.selectedOptionalItemCodes,
      isNewStudent: dto.isNewStudent,
      isBoardingStudent: dto.isBoardingStudent,
      paymentDate: dto.paymentDate,
      waiverAmount: dto.waiverAmount,
    });
  }

  // --- Invoicing & Fee Processing ---
  async getInvoices(tenantId: string, filters: { studentId?: string; status?: string; classId?: string }) {
    const whereClause: any = { tenantId };
    if (filters.studentId) whereClause.studentId = filters.studentId;
    if (filters.status) whereClause.status = filters.status;
    if (filters.classId) whereClause.classId = filters.classId;

    const dbInvoices = await this.prisma.invoice.findMany({
      where: whereClause,
      include: {
        student: {
          include: {
            campus: true,
            enrollments: {
              where: { status: 'ACTIVE' },
              include: { class: true },
              orderBy: { enrolledAt: 'desc' },
              take: 1,
            },
          },
        },
        payments: {
          where: { status: 'SUCCESSFUL' },
          orderBy: { paidAt: 'desc' },
        },
        feeStructure: true,
      },
      orderBy: { dueDate: 'desc' },
    });

    return dbInvoices.map((inv) => {
      const payments = inv.payments.map((p) => ({
        ref: p.reference || p.id,
        date: p.paidAt ? p.paidAt.toISOString().split('T')[0] : p.createdAt.toISOString().split('T')[0],
        amount: Number(p.amount || 0),
        channel: p.provider,
      }));

      const lineItems = Array.isArray(inv.lineItems)
        ? inv.lineItems
        : typeof inv.feeStructure?.items === 'object' && Array.isArray(inv.feeStructure.items)
        ? inv.feeStructure.items
        : [];

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        student: inv.student ? `${inv.student.firstName} ${inv.student.lastName}` : 'Student',
        studentId: inv.student ? inv.student.admissionNumber || inv.student.id : inv.studentId,
        class: inv.student?.enrollments?.[0]?.class?.name || 'Unassigned',
        amount: inv.totalAmount,
        paid: inv.paidAmount,
        balance: inv.balanceAmount,
        status: inv.status === 'PAID' ? 'Paid' : inv.status === 'PARTIALLY_PAID' ? 'Partial' : 'Pending',
        dueDate: inv.dueDate ? inv.dueDate.toISOString().split('T')[0] : null,
        term: 'Current Term',
        items: lineItems.map((it: any) => ({
          name: it.name || it.description || 'Fee Item',
          amount: Number(it.amount || 0),
        })),
        payments,
      };
    });
  }

  async getMyInvoices(tenantId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roles = (user.userRoles || []).map((ur) => ur.role?.name);
    const isStudent = roles.includes('STUDENT');
    const isParent = roles.includes('PARENT');

    let targetStudentIds: string[] = [];

    if (isStudent) {
      const student = await this.prisma.student.findFirst({
        where: {
          tenantId,
          OR: [
            { email: user.email },
            ...(user.phone ? [{ phone: user.phone }] : []),
          ],
        },
      });

      if (student) {
        targetStudentIds.push(student.id);
      } else {
        return [];
      }
    } else if (isParent) {
      const cleanPhone = (user.phone || '').replace(/[^0-9+]/g, '');
      const phoneFilter = cleanPhone.length >= 7 ? cleanPhone.slice(-10) : cleanPhone;
      const parent = await this.prisma.parent.findFirst({
        where: {
          tenantId,
          OR: [
            { email: user.email },
            ...(phoneFilter ? [{ phone: { contains: phoneFilter } }] : []),
          ],
        },
        include: {
          students: { include: { student: true } },
        },
      });

      if (parent && parent.students) {
        targetStudentIds = parent.students.map((sp) => sp.studentId);
      } else {
        return [];
      }
    }

    const whereClause: any = { tenantId };
    if (isStudent || isParent) {
      if (targetStudentIds.length === 0) {
        return [];
      }
      whereClause.studentId = { in: targetStudentIds };
    }

    const dbInvoices = await this.prisma.invoice.findMany({
      where: whereClause,
      include: {
        student: {
          include: {
            campus: true,
            enrollments: {
              where: { status: 'ACTIVE' },
              include: { class: true },
              orderBy: { enrolledAt: 'desc' },
              take: 1,
            },
          },
        },
        payments: {
          where: { status: 'SUCCESSFUL' },
          orderBy: { paidAt: 'desc' },
        },
        feeStructure: true,
      },
      orderBy: { dueDate: 'desc' },
    });

    return dbInvoices.map((inv) => {
      const payments = inv.payments.map((p) => ({
        id: p.id,
        ref: p.reference,
        date: p.paidAt ? p.paidAt.toISOString().split('T')[0] : p.createdAt.toISOString().split('T')[0],
        amount: p.amount,
        channel: p.provider,
        status: p.status,
      }));

      const lineItems = Array.isArray(inv.lineItems)
        ? inv.lineItems
        : typeof inv.feeStructure?.items === 'object' && Array.isArray(inv.feeStructure.items)
        ? inv.feeStructure.items
        : [];

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        studentId: inv.studentId,
        studentName: inv.student ? `${inv.student.firstName} ${inv.student.lastName}` : 'Student',
        admissionNumber: inv.student?.admissionNumber || 'N/A',
        className: inv.student?.enrollments?.[0]?.class?.name || 'Unassigned',
        campus: inv.student?.campus?.name || 'Main Campus',
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        balanceAmount: inv.balanceAmount,
        currency: inv.currency || 'NGN',
        status: inv.status,
        dueDate: inv.dueDate ? inv.dueDate.toISOString().split('T')[0] : null,
        issuedAt: inv.issuedAt ? inv.issuedAt.toISOString().split('T')[0] : null,
        notes: inv.notes,
        items: lineItems.map((it: any) => ({
          name: it.name || it.description || 'Tuition / School Fee',
          amount: Number(it.amount || 0),
        })),
        payments,
      };
    });
  }

  async generateInvoice(tenantId: string, data: any) {
    let student: any = null;
    let fee: any = null;

    if (data.studentId) {
      student = await this.prisma.student.findFirst({
        where: {
          tenantId,
          OR: [{ id: data.studentId }, { admissionNumber: data.studentId }],
        },
      });
    }
    if (data.feeStructureId) {
      fee = await this.prisma.feeStructure.findFirst({
        where: { id: data.feeStructureId, tenantId },
      });
    }

    if (!student && data.studentId) {
      throw new NotFoundException(`Student '${data.studentId}' not found`);
    }

    let subtotal = 0;
    let discountAmount = 0;
    let latePenaltyAmount = 0;
    let waiverAmount = 0;
    let totalAmount = 0;
    let lineItems = [];

    if (fee) {
      const evalRes = FeeCalculator.evaluate({
        items: fee.items || [{ name: fee.name, code: 'BASE', amount: fee.amount, isOptional: false }],
        currency: fee.currency,
        targetAudience: fee.targetAudience,
        dueDate: fee.dueDate,
        lateFeePercentage: fee.lateFeePercentage,
        lateFeeGraceDays: fee.lateFeeGraceDays,
        earlyBirdDiscountPercentage: fee.earlyBirdDiscountPercentage,
        earlyBirdCutoffDate: fee.earlyBirdCutoffDate,
        selectedOptionalCodes: data.selectedOptionalItemCodes,
        isNewStudent: data.isNewStudent,
        isBoardingStudent: data.isBoardingStudent,
        paymentDate: data.paymentDate,
        waiverAmount: data.waiverAmount,
      });
      subtotal = evalRes.subtotal;
      discountAmount = evalRes.discountAmount;
      latePenaltyAmount = evalRes.latePenaltyAmount;
      waiverAmount = evalRes.waiverAmount;
      totalAmount = evalRes.totalAmount;
      lineItems = evalRes.lineItems;
    } else {
      lineItems =
        data.items || [
          { name: 'Tuition Fee', amount: Number(data.amount) || 80000, isOptional: false },
          { name: 'Development Levy', amount: 20000, isOptional: false },
        ];
      subtotal = Number(
        data.subtotal || data.amount || lineItems.reduce((sum: number, it: any) => sum + Number(it.amount || 0), 0),
      );
      discountAmount = Number(data.discountAmount || 0);
      latePenaltyAmount = Number(data.latePenaltyAmount || 0);
      waiverAmount = Number(data.waiverAmount || 0);
      totalAmount = data.totalAmount !== undefined ? Number(data.totalAmount) : (subtotal - discountAmount - waiverAmount + latePenaltyAmount);
    }

    const totalInvoicesCount = await this.prisma.invoice.count({ where: { tenantId } });
    const invoiceNumber = `INV-${new Date().getFullYear()}-${(totalInvoicesCount + 1).toString().padStart(4, '0')}`;
    const id = `inv_${randomUUID().replace(/-/g, '').substring(0, 10)}`;

    const studentId = student?.id || data.studentId;
    const dueDate = data.dueDate ? new Date(data.dueDate) : fee?.dueDate || new Date();
    const status = totalAmount === 0 ? 'PAID' : 'PENDING';

    const createdInv = await this.prisma.invoice.create({
      data: {
        id,
        tenantId,
        studentId,
        feeStructureId: data.feeStructureId || fee?.id || null,
        classId: student?.currentClassId || data.classId || data.class || null,
        academicYearId: fee?.academicYearId || data.academicYearId || null,
        termId: data.termId || fee?.termId || null,
        invoiceNumber,
        subtotal,
        discountAmount,
        waiverAmount,
        latePenaltyAmount,
        totalAmount,
        paidAmount: 0,
        balanceAmount: totalAmount,
        currency: fee?.currency || data.currency || 'NGN',
        lineItems: lineItems as any,
        notes: data.notes || null,
        dueDate,
        status: status as any,
      },
    });

    // Dispatch In-App Parent Alert
    try {
      const studentParents = await this.prisma.studentParent.findMany({
        where: { studentId, student: { tenantId } },
        include: { parent: { include: { user: true } } },
      });

      for (const sp of studentParents) {
        const parentUserId = sp.parent?.userId || sp.parent?.user?.id;
        if (parentUserId) {
          await this.prisma.inAppInboxItem.create({
            data: {
              id: `inb_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
              tenantId,
              recipientUserId: parentUserId,
              category: 'FEE_REMINDER',
              priority: 'HIGH',
              title: `New School Fee Invoice: ${invoiceNumber}`,
              message: `Invoice ${invoiceNumber} of ${createdInv.currency} ${totalAmount.toLocaleString()} has been issued for ${student ? `${student.firstName} ${student.lastName}` : 'student'}. Due date: ${dueDate.toISOString().split('T')[0]}.`,
              actionUrl: '/parent',
              isRead: false,
            },
          });
        }
      }
    } catch {}

    return {
      ...createdInv,
      amount: totalAmount,
      paid: 0,
      balance: totalAmount,
      dueDate: typeof createdInv.dueDate === 'string' ? createdInv.dueDate : createdInv.dueDate.toISOString().split('T')[0],
      payments: [],
    };
  }

  // --- Fee Waivers & Discounts ---
  async applyFeeWaiver(
    tenantId: string,
    data: {
      invoiceId: string;
      studentId: string;
      feeStructureId?: string;
      waiverType?: 'SIBLING_DISCOUNT' | 'SCHOLARSHIP' | 'FINANCIAL_AID' | 'STAFF_CHILD';
      amount: number;
      reason: string;
      approvedByUserId?: string;
    },
  ) {
    const dbInv = await this.prisma.invoice.findFirst({
      where: { id: data.invoiceId, tenantId },
    });

    if (!dbInv) {
      throw new NotFoundException(`Invoice '${data.invoiceId}' not found`);
    }

    const waiverId = `wv_${randomUUID().replace(/-/g, '').substring(0, 10)}`;

    const waiver = await this.prisma.feeWaiver.create({
      data: {
        id: waiverId,
        tenantId,
        studentId: data.studentId,
        feeStructureId: data.feeStructureId || dbInv.feeStructureId || data.invoiceId,
        waiverAmount: Number(data.amount),
        reason: data.reason,
        approvedByUserId: data.approvedByUserId || null,
      },
    });

    const newWaiverAmount = Number(dbInv.waiverAmount || 0) + Number(data.amount);
    const newTotalAmount = Math.max(0, Number(dbInv.subtotal) - Number(dbInv.discountAmount) - newWaiverAmount + Number(dbInv.latePenaltyAmount));
    const newBalanceAmount = Math.max(0, newTotalAmount - Number(dbInv.paidAmount));
    const newStatus = newBalanceAmount === 0 && Number(dbInv.paidAmount) > 0 ? 'PAID' : dbInv.status;

    const updatedInv = await this.prisma.invoice.update({
      where: { id: data.invoiceId },
      data: {
        waiverAmount: newWaiverAmount,
        totalAmount: newTotalAmount,
        balanceAmount: newBalanceAmount,
        status: newStatus,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: data.approvedByUserId || null,
        action: 'FEE_WAIVER_APPLIED',
        resourceType: 'Invoice',
        resourceId: data.invoiceId,
        beforeData: {
          waiverAmount: dbInv.waiverAmount,
          totalAmount: dbInv.totalAmount,
          balanceAmount: dbInv.balanceAmount,
        } as any,
        afterData: {
          studentId: data.studentId,
          waiverId,
          waiverAmount: newWaiverAmount,
          adjustmentAmount: Number(data.amount),
          newBalanceAmount,
          reason: data.reason,
          waiverType: data.waiverType,
        } as any,
      },
    }).catch(() => {});

    return {
      waiver,
      updatedInvoice: updatedInv,
      message: `Waiver of ${data.amount} successfully applied to invoice.`,
    };
  }

  async getWaivers(tenantId: string, studentId?: string) {
    const whereClause: any = { tenantId };
    if (studentId) whereClause.studentId = studentId;

    const dbWaivers = await this.prisma.feeWaiver.findMany({
      where: whereClause,
      include: { student: true, feeStructure: true },
      orderBy: { createdAt: 'desc' },
    });

    return dbWaivers;
  }
}
