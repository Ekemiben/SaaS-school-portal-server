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
    let list = Array.from(this.prisma.memoryStore.feeStructures.values()).filter(
      (f: any) => f.tenantId === tenantId,
    );

    if (filters.campusId) list = list.filter((f: any) => !f.campusId || f.campusId === filters.campusId);
    if (filters.academicYearId) list = list.filter((f: any) => f.academicYearId === filters.academicYearId);
    if (filters.termId) list = list.filter((f: any) => f.termId === filters.termId);
    if (filters.classId) list = list.filter((f: any) => !f.classId || f.classId === filters.classId);

    return list;
  }

  async getFeeStructureById(tenantId: string, id: string) {
    const fee = this.prisma.memoryStore.feeStructures.get(id);
    if (!fee || fee.tenantId !== tenantId) {
      throw new NotFoundException('Fee structure not found');
    }
    return fee;
  }

  async createFeeStructure(tenantId: string, dto: CreateFeeStructureDto) {
    const id = `fee_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const items = dto.items || [];
    const calculatedMandatoryAmount = items
      .filter((it) => !it.isOptional)
      .reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

    const totalAmount = dto.amount !== undefined ? Number(dto.amount) : calculatedMandatoryAmount;

    const fee = {
      id,
      tenantId,
      campusId: dto.campusId,
      academicYearId: dto.academicYearId,
      termId: dto.termId || null,
      classId: dto.classId || null,
      name: dto.name,
      code: dto.code || dto.name.toUpperCase().replace(/\s+/g, '_'),
      description: dto.description || null,
      amount: totalAmount,
      currency: dto.currency || 'USD',
      items,
      targetAudience: dto.targetAudience || 'ALL',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      applicableGradeLevel: dto.applicableGradeLevel || null,
      lateFeePercentage: dto.lateFeePercentage || 0,
      lateFeeGraceDays: dto.lateFeeGraceDays || 0,
      earlyBirdDiscountPercentage: dto.earlyBirdDiscountPercentage || 0,
      earlyBirdCutoffDate: dto.earlyBirdCutoffDate ? new Date(dto.earlyBirdCutoffDate) : null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.feeStructures.set(id, fee);
    return fee;
  }

  async updateFeeStructure(tenantId: string, id: string, dto: UpdateFeeStructureDto) {
    const fee = await this.getFeeStructureById(tenantId, id);

    if (dto.name) fee.name = dto.name;
    if (dto.code) fee.code = dto.code;
    if (dto.description !== undefined) fee.description = dto.description;
    if (dto.termId !== undefined) fee.termId = dto.termId;
    if (dto.classId !== undefined) fee.classId = dto.classId;
    if (dto.applicableGradeLevel !== undefined) fee.applicableGradeLevel = dto.applicableGradeLevel;
    if (dto.targetAudience !== undefined) fee.targetAudience = dto.targetAudience;
    if (dto.currency !== undefined) fee.currency = dto.currency;
    if (dto.dueDate !== undefined) fee.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.lateFeePercentage !== undefined) fee.lateFeePercentage = dto.lateFeePercentage;
    if (dto.lateFeeGraceDays !== undefined) fee.lateFeeGraceDays = dto.lateFeeGraceDays;
    if (dto.earlyBirdDiscountPercentage !== undefined) fee.earlyBirdDiscountPercentage = dto.earlyBirdDiscountPercentage;
    if (dto.earlyBirdCutoffDate !== undefined) {
      fee.earlyBirdCutoffDate = dto.earlyBirdCutoffDate ? new Date(dto.earlyBirdCutoffDate) : null;
    }
    if (dto.items) {
      fee.items = dto.items;
      fee.amount = dto.items
        .filter((it) => !it.isOptional)
        .reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
    }
    fee.updatedAt = new Date();

    this.prisma.memoryStore.feeStructures.set(id, fee);
    return fee;
  }

  async deleteFeeStructure(tenantId: string, id: string) {
    const fee = await this.getFeeStructureById(tenantId, id);
    this.prisma.memoryStore.feeStructures.delete(id);
    return { success: true, message: `Fee structure "${fee.name}" deleted successfully` };
  }

  // --- Fee Evaluation & Student Breakdown ---
  async evaluateStudentFee(tenantId: string, dto: EvaluateStudentFeeDto) {
    const fee = await this.getFeeStructureById(tenantId, dto.feeStructureId);
    const student = this.prisma.memoryStore.students.get(dto.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student record not found');
    }

    return FeeCalculator.evaluate({
      items: fee.items || [{ name: fee.name, code: 'BASE', amount: fee.amount, isOptional: false }],
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
    if (this.prisma.isDbConnected) {
      try {
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

        if (dbInvoices.length > 0) {
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
      } catch (err: any) {
        this.logger.warn(`Could not query invoices from DB: ${err.message}`);
      }
    }

    let invoices = Array.from(this.prisma.memoryStore.invoices.values()).filter(
      (i: any) => i.tenantId === tenantId,
    );

    if (filters.studentId) invoices = invoices.filter((i: any) => i.studentId === filters.studentId);
    if (filters.status) invoices = invoices.filter((i: any) => i.status === filters.status);
    if (filters.classId) invoices = invoices.filter((i: any) => i.classId === filters.classId);

    return invoices.map((inv: any) => {
      const student =
        this.prisma.memoryStore.students.get(inv.studentId) ||
        Array.from(this.prisma.memoryStore.students.values()).find(
          (s: any) =>
            s.tenantId === tenantId && (s.admissionNumber === inv.studentId || s.id === inv.studentId),
        );

      const totalAmount = Number(inv.totalAmount !== undefined ? inv.totalAmount : inv.amount || 0);
      const paidAmount = Number(inv.paidAmount !== undefined ? inv.paidAmount : inv.paid || 0);
      const balanceAmount = Number(
        inv.balanceAmount !== undefined ? inv.balanceAmount : Math.max(0, totalAmount - paidAmount),
      );

      const normalizedStatus =
        paidAmount >= totalAmount && totalAmount > 0
          ? 'Paid'
          : paidAmount > 0
          ? 'Partial'
          : 'Pending';

      const dueDateStr =
        typeof inv.dueDate === 'string'
          ? inv.dueDate
          : inv.dueDate?.toISOString?.().split('T')[0] || '2025-10-15';

      const payments = Array.from(this.prisma.memoryStore.payments.values())
        .filter(
          (p: any) =>
            p.tenantId === tenantId &&
            p.invoiceId === inv.id &&
            (p.status === 'SUCCESSFUL' || p.status === 'Success'),
        )
        .map((p: any) => ({
          ref: p.reference || p.id,
          date:
            typeof p.paidAt === 'string'
              ? p.paidAt
              : (p.paidAt || p.createdAt)?.toISOString?.().split('T')[0] ||
                new Date().toISOString().split('T')[0],
          amount: Number(p.amount || 0),
          channel: p.channel || p.gateway || p.provider || 'Direct Bank Transfer',
        }));

      return {
        ...inv,
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id,
        student: student ? `${student.firstName} ${student.lastName}` : inv.student || 'Student',
        studentId: student ? student.admissionNumber || student.id : inv.studentId || 'STD-001',
        class: student?.currentClass || inv.class || 'JSS 1A',
        amount: totalAmount,
        paid: paidAmount,
        balance: balanceAmount,
        status: normalizedStatus,
        dueDate: dueDateStr,
        term: inv.termId || inv.term || 'First Term 2025/2026',
        items: (inv.lineItems || inv.items || []).map((it: any) => ({
          name: it.name || it.description || 'Fee Item',
          amount: Number(it.amount || 0),
        })),
        payments,
      };
    });
  }

  async getMyInvoices(tenantId: string, userId: string) {
    if (this.prisma.isDbConnected) {
      try {
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
          let student = await this.prisma.student.findFirst({
            where: {
              tenantId,
              OR: [
                { email: user.email },
                ...(user.phone ? [{ phone: user.phone }] : []),
              ],
            },
          });

          if (!student) {
            const cleanPrefix = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
            const candidates = await this.prisma.student.findMany({
              where: {
                tenantId,
                OR: [{ firstName: user.firstName, lastName: user.lastName }],
              },
            });
            student =
              candidates.find((s) => s.admissionNumber.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanPrefix) ||
              candidates[0] ||
              null;
          }

          if (student) {
            targetStudentIds.push(student.id);
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
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Could not fetch portal invoices from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.invoices.values())
      .filter((i: any) => i.tenantId === tenantId)
      .map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id,
        studentId: inv.studentId,
        studentName: 'Student',
        admissionNumber: 'SCH/2026/001',
        className: 'JSS 1A',
        campus: 'Main Campus',
        totalAmount: Number(inv.totalAmount || inv.amount || 0),
        paidAmount: Number(inv.paidAmount || inv.paid || 0),
        balanceAmount: Number(inv.balanceAmount || Math.max(0, (inv.totalAmount || 0) - (inv.paidAmount || 0))),
        currency: inv.currency || 'NGN',
        status: inv.status || 'PENDING',
        dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : null,
        items: [],
        payments: [],
      }));
  }

  async generateInvoice(
    tenantId: string,
    data: any,
  ) {
    let student = data.studentId ? this.prisma.memoryStore.students.get(data.studentId) : null;
    if (!student && data.studentId) {
      student = Array.from(this.prisma.memoryStore.students.values()).find(
        (s: any) =>
          s.tenantId === tenantId && (s.admissionNumber === data.studentId || s.id === data.studentId),
      );
    }

    const fee = data.feeStructureId
      ? this.prisma.memoryStore.feeStructures.get(data.feeStructureId)
      : null;

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

    const count = this.prisma.memoryStore.invoices.size + 1;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${count.toString().padStart(4, '0')}`;
    const id = `inv_${randomUUID().replace(/-/g, '').substring(0, 10)}`;

    const invoice = {
      id,
      tenantId,
      studentId: student?.id || data.studentId || 'std_adhoc',
      student: data.student || (student ? `${student.firstName} ${student.lastName}` : 'Student'),
      feeStructureId: data.feeStructureId || fee?.id || null,
      classId: student?.currentClassId || data.class || 'JSS 1A',
      class: data.class || student?.currentClass || 'JSS 1A',
      academicYearId: fee?.academicYearId || 'ay_2026_2027',
      termId: data.term || fee?.termId || 'First Term 2025/2026',
      term: data.term || fee?.termId || 'First Term 2025/2026',
      invoiceNumber,
      subtotal,
      discountAmount,
      waiverAmount,
      latePenaltyAmount,
      totalAmount,
      paidAmount: 0,
      balanceAmount: totalAmount,
      currency: fee?.currency || 'NGN',
      lineItems,
      items: lineItems,
      notes: data.notes || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : fee?.dueDate || new Date(),
      status: totalAmount === 0 ? 'PAID' : 'PENDING',
      issuedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.invoices.set(id, invoice);
    return {
      ...invoice,
      amount: totalAmount,
      paid: 0,
      balance: totalAmount,
      status: invoice.status,
      dueDate: typeof invoice.dueDate === 'string' ? invoice.dueDate : invoice.dueDate.toISOString().split('T')[0],
      payments: [],
    };
  }

  // --- Fee Waivers & Discounts ---
  async applyFeeWaiver(
    tenantId: string,
    data: {
      invoiceId: string;
      studentId: string;
      waiverType: 'SIBLING_DISCOUNT' | 'SCHOLARSHIP' | 'FINANCIAL_AID' | 'STAFF_CHILD';
      amount: number;
      reason: string;
    },
  ) {
    const invoice = this.prisma.memoryStore.invoices.get(data.invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found');
    }

    const waiverId = `wv_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const waiver = {
      id: waiverId,
      tenantId,
      invoiceId: data.invoiceId,
      studentId: data.studentId,
      waiverType: data.waiverType,
      amount: Number(data.amount),
      reason: data.reason,
      appliedAt: new Date(),
    };

    this.prisma.memoryStore.feeWaivers.set(waiverId, waiver);

    // Update invoice totals
    const subtotal = invoice.subtotal !== undefined ? Number(invoice.subtotal) : Number(invoice.totalAmount || 0);
    const discountAmount = Number(invoice.discountAmount || 0);
    const latePenaltyAmount = Number(invoice.latePenaltyAmount || 0);
    invoice.waiverAmount = Number((invoice.waiverAmount || 0) + Number(data.amount));
    invoice.totalAmount = Math.max(0, subtotal - discountAmount - invoice.waiverAmount + latePenaltyAmount);
    invoice.balanceAmount = Math.max(0, invoice.totalAmount - (Number(invoice.paidAmount) || 0));
    if (invoice.balanceAmount === 0 && invoice.paidAmount > 0) {
      invoice.status = 'PAID';
    }
    invoice.updatedAt = new Date();
    this.prisma.memoryStore.invoices.set(invoice.id, invoice);

    return {
      waiver,
      updatedInvoice: invoice,
      message: `${data.waiverType} of ${data.amount} successfully applied to invoice.`,
    };
  }

  async getWaivers(tenantId: string, studentId?: string) {
    return Array.from(this.prisma.memoryStore.feeWaivers.values()).filter(
      (w: any) => w.tenantId === tenantId && (!studentId || w.studentId === studentId),
    );
  }
}
