import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  PayLibraryFineDto,
  WaiveLibraryFineDto,
} from '../dto/library-fine.dto.js';
import { FineFilterDto } from '../dto/library-filter.dto.js';

@Injectable()
export class LibraryFineService {
  private readonly logger = new Logger(LibraryFineService.name);

  constructor(private readonly prisma: PrismaService) {}

  async calculateOverdueFines(tenantId: string) {
    const now = new Date();
    const activeIssues = await this.prisma.bookIssue.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'OVERDUE'] },
        dueDate: { lt: now },
      },
    });

    const updatedFines = [];
    const fineRate = 100.0;

    for (const issue of activeIssues) {
      const overdueDays = Math.max(1, Math.ceil((now.getTime() - new Date(issue.dueDate).getTime()) / (1000 * 3600 * 24)));
      const fineAmount = overdueDays * fineRate;

      await this.prisma.bookIssue.update({
        where: { id: issue.id },
        data: {
          status: 'OVERDUE',
          overdueDays,
          fineAmount,
        },
      });

      const existingFine = await this.prisma.libraryFine.findFirst({
        where: { tenantId, issueId: issue.id },
      });

      let fineRecord;
      if (!existingFine) {
        fineRecord = await this.prisma.libraryFine.create({
          data: {
            tenantId,
            campusId: issue.campusId,
            issueId: issue.id,
            studentId: issue.studentId,
            staffUserId: issue.staffUserId,
            overdueDays,
            ratePerDay: fineRate,
            totalAmount: fineAmount,
            paidAmount: 0,
            balanceDue: fineAmount,
            status: 'UNPAID',
            waivedByUserId: null,
            waiveReason: null,
            paymentReference: null,
            paidAt: null,
          },
        });
      } else if (existingFine.status !== 'PAID' && existingFine.status !== 'WAIVED') {
        const balanceDue = Math.max(0, fineAmount - existingFine.paidAmount);
        fineRecord = await this.prisma.libraryFine.update({
          where: { id: existingFine.id },
          data: {
            overdueDays,
            totalAmount: fineAmount,
            balanceDue,
          },
        });
      } else {
        fineRecord = existingFine;
      }

      updatedFines.push(fineRecord);
    }

    return updatedFines;
  }

  async payFine(tenantId: string, fineId: string, dto: PayLibraryFineDto) {
    const fine = await this.prisma.libraryFine.findFirst({
      where: { id: fineId, tenantId },
    });
    if (!fine) {
      throw new NotFoundException(`Fine with ID ${fineId} not found`);
    }

    if (fine.status === 'PAID') {
      throw new BadRequestException('Fine is already fully paid');
    }

    const newPaidAmount = fine.paidAmount + dto.amount;
    const newBalance = Math.max(0, fine.totalAmount - newPaidAmount);
    const newStatus = newBalance === 0 ? 'PAID' : 'PARTIALLY_PAID';

    const updatedFine = await this.prisma.libraryFine.update({
      where: { id: fineId },
      data: {
        paidAmount: newPaidAmount,
        balanceDue: newBalance,
        status: newStatus,
        paymentReference: dto.paymentReference || fine.paymentReference,
        paidAt: newBalance === 0 ? new Date() : fine.paidAt,
      },
    });

    // Update issue fine status
    await this.prisma.bookIssue.update({
      where: { id: fine.issueId },
      data: { finePaidStatus: newStatus },
    });

    return updatedFine;
  }

  async waiveFine(
    tenantId: string,
    fineId: string,
    waivedByUserId: string,
    dto: WaiveLibraryFineDto,
  ) {
    const fine = await this.prisma.libraryFine.findFirst({
      where: { id: fineId, tenantId },
    });
    if (!fine) {
      throw new NotFoundException(`Fine with ID ${fineId} not found`);
    }

    const updatedFine = await this.prisma.libraryFine.update({
      where: { id: fineId },
      data: {
        status: 'WAIVED',
        balanceDue: 0,
        waivedByUserId,
        waiveReason: dto.waiveReason,
      },
    });

    await this.prisma.bookIssue.update({
      where: { id: fine.issueId },
      data: { finePaidStatus: 'WAIVED' },
    });

    return updatedFine;
  }

  async listFines(tenantId: string, filter?: FineFilterDto) {
    const where: any = { tenantId };
    if (filter?.studentId) where.studentId = filter.studentId;
    if (filter?.staffUserId) where.staffUserId = filter.staffUserId;
    if (filter?.status) where.status = filter.status;
    if (filter?.issueId) where.issueId = filter.issueId;
    if (filter?.campusId) where.campusId = filter.campusId;

    const list = await this.prisma.libraryFine.findMany({
      where,
      include: {
        student: true,
        issue: {
          include: { book: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((f) => ({
      ...f,
      studentName: f.student ? `${f.student.firstName} ${f.student.lastName}` : 'Patron',
      admissionNumber: f.student?.admissionNumber || '',
      bookTitle: f.issue?.book?.title || 'Book',
    }));
  }

  async getFineById(tenantId: string, fineId: string) {
    const fine = await this.prisma.libraryFine.findFirst({
      where: { id: fineId, tenantId },
      include: {
        student: true,
        issue: {
          include: { book: true },
        },
      },
    });
    if (!fine) {
      throw new NotFoundException(`Fine with ID ${fineId} not found`);
    }

    return {
      ...fine,
      studentName: fine.student ? `${fine.student.firstName} ${fine.student.lastName}` : 'Patron',
      admissionNumber: fine.student?.admissionNumber || '',
      bookTitle: fine.issue?.book?.title || 'Book',
    };
  }
}
