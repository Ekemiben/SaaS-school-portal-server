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
    const activeIssues = Array.from(this.prisma.memoryStore.bookIssues.values()).filter(
      (i) => i.tenantId === tenantId && (i.status === 'ACTIVE' || i.status === 'OVERDUE') && new Date(i.dueDate) < now,
    );

    const updatedFines = [];
    const fineRate = 100.0;

    for (const issue of activeIssues) {
      issue.status = 'OVERDUE';
      const overdueDays = Math.max(1, Math.ceil((now.getTime() - new Date(issue.dueDate).getTime()) / (1000 * 3600 * 24)));
      const fineAmount = overdueDays * fineRate;

      issue.overdueDays = overdueDays;
      issue.fineAmount = fineAmount;
      issue.updatedAt = now;
      this.prisma.memoryStore.bookIssues.set(issue.id, issue);

      let fine = Array.from(this.prisma.memoryStore.libraryFines.values()).find(
        (f) => f.tenantId === tenantId && f.issueId === issue.id,
      );

      if (!fine) {
        const fineId = `fin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        fine = {
          id: fineId,
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
          createdAt: now,
          updatedAt: now,
        };
        this.prisma.memoryStore.libraryFines.set(fineId, fine);
      } else if (fine.status !== 'PAID' && fine.status !== 'WAIVED') {
        fine.overdueDays = overdueDays;
        fine.totalAmount = fineAmount;
        fine.balanceDue = Math.max(0, fineAmount - fine.paidAmount);
        fine.updatedAt = now;
        this.prisma.memoryStore.libraryFines.set(fine.id, fine);
      }

      updatedFines.push(fine);
    }

    return updatedFines;
  }

  async payFine(tenantId: string, fineId: string, dto: PayLibraryFineDto) {
    const fine = this.prisma.memoryStore.libraryFines.get(fineId);
    if (!fine || fine.tenantId !== tenantId) {
      throw new NotFoundException(`Fine with ID ${fineId} not found`);
    }

    if (fine.status === 'PAID') {
      throw new BadRequestException('Fine is already fully paid');
    }

    const newPaidAmount = fine.paidAmount + dto.amount;
    const newBalance = Math.max(0, fine.totalAmount - newPaidAmount);

    fine.paidAmount = newPaidAmount;
    fine.balanceDue = newBalance;
    fine.status = newBalance === 0 ? 'PAID' : 'PARTIALLY_PAID';
    if (dto.paymentReference) fine.paymentReference = dto.paymentReference;
    if (newBalance === 0) fine.paidAt = new Date();
    fine.updatedAt = new Date();

    this.prisma.memoryStore.libraryFines.set(fineId, fine);

    // Update issue fine status
    const issue = this.prisma.memoryStore.bookIssues.get(fine.issueId);
    if (issue) {
      issue.finePaidStatus = fine.status;
      issue.updatedAt = new Date();
      this.prisma.memoryStore.bookIssues.set(issue.id, issue);
    }

    return fine;
  }

  async waiveFine(
    tenantId: string,
    fineId: string,
    waivedByUserId: string,
    dto: WaiveLibraryFineDto,
  ) {
    const fine = this.prisma.memoryStore.libraryFines.get(fineId);
    if (!fine || fine.tenantId !== tenantId) {
      throw new NotFoundException(`Fine with ID ${fineId} not found`);
    }

    fine.status = 'WAIVED';
    fine.balanceDue = 0;
    fine.waivedByUserId = waivedByUserId;
    fine.waiveReason = dto.waiveReason;
    fine.updatedAt = new Date();

    this.prisma.memoryStore.libraryFines.set(fineId, fine);

    const issue = this.prisma.memoryStore.bookIssues.get(fine.issueId);
    if (issue) {
      issue.finePaidStatus = 'WAIVED';
      issue.updatedAt = new Date();
      this.prisma.memoryStore.bookIssues.set(issue.id, issue);
    }

    return fine;
  }

  async listFines(tenantId: string, filter?: FineFilterDto) {
    let list = Array.from(this.prisma.memoryStore.libraryFines.values()).filter(
      (f) => f.tenantId === tenantId,
    );

    if (filter?.studentId) list = list.filter((f) => f.studentId === filter.studentId);
    if (filter?.staffUserId) list = list.filter((f) => f.staffUserId === filter.staffUserId);
    if (filter?.status) list = list.filter((f) => f.status === filter.status);
    if (filter?.issueId) list = list.filter((f) => f.issueId === filter.issueId);
    if (filter?.campusId) list = list.filter((f) => f.campusId === filter.campusId);

    return list.map((f) => {
      const student = f.studentId ? this.prisma.memoryStore.students.get(f.studentId) : null;
      const issue = this.prisma.memoryStore.bookIssues.get(f.issueId);
      const book = issue ? this.prisma.memoryStore.books.get(issue.bookId) : null;

      return {
        ...f,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Patron',
        admissionNumber: student?.admissionNumber || '',
        bookTitle: book?.title || 'Book',
      };
    });
  }

  async getFineById(tenantId: string, fineId: string) {
    const fine = this.prisma.memoryStore.libraryFines.get(fineId);
    if (!fine || fine.tenantId !== tenantId) {
      throw new NotFoundException(`Fine with ID ${fineId} not found`);
    }

    const student = fine.studentId ? this.prisma.memoryStore.students.get(fine.studentId) : null;
    const issue = this.prisma.memoryStore.bookIssues.get(fine.issueId);
    const book = issue ? this.prisma.memoryStore.books.get(issue.bookId) : null;

    return {
      ...fine,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Patron',
      admissionNumber: student?.admissionNumber || '',
      bookTitle: book?.title || 'Book',
    };
  }
}
