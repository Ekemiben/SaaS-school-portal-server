import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { QueueService } from '../../../jobs/queue.service.js';
import { QUEUES } from '../../../jobs/queue.constants.js';
import {
  IssueBookDto,
  ReturnBookDto,
  RenewBookDto,
} from '../dto/issue-book.dto.js';
import { IssueFilterDto } from '../dto/library-filter.dto.js';
import { BookCatalogService } from './book-catalog.service.js';

@Injectable()
export class BookCirculationService {
  private readonly logger = new Logger(BookCirculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: BookCatalogService,
    private readonly queueService: QueueService,
  ) {}

  async issueBook(
    tenantId: string,
    campusId: string,
    issuedByUserId: string,
    dto: IssueBookDto,
  ) {
    const book = await this.catalogService.getBookById(tenantId, dto.bookId);

    let borrowerName = 'Patron';
    let borrowerIdentifier = '';

    if (dto.borrowerType === 'STUDENT') {
      if (!dto.studentId) throw new BadRequestException('studentId is required for student loans');
      const student = await this.prisma.student.findFirst({
        where: { id: dto.studentId, tenantId },
      });
      if (!student) {
        throw new NotFoundException(`Student with ID ${dto.studentId} not found`);
      }
      borrowerName = `${student.firstName} ${student.lastName}`;
      borrowerIdentifier = student.admissionNumber;

      // Limit active loans to 5
      const activeStudentLoansCount = await this.prisma.bookIssue.count({
        where: {
          tenantId,
          studentId: dto.studentId,
          status: { in: ['ACTIVE', 'OVERDUE'] },
        },
      });
      if (activeStudentLoansCount >= 5) {
        throw new BadRequestException('Student has reached maximum active loan limit (5 books)');
      }
    }

    // Resolve specific copy
    let copy: any;
    if (dto.barcodeOrRfid) {
      copy = await this.catalogService.getBookCopyByBarcode(tenantId, dto.barcodeOrRfid);
    } else if (dto.bookCopyId) {
      copy = await this.catalogService.getBookCopyById(tenantId, dto.bookCopyId);
    } else {
      const availableCopy = await this.prisma.bookCopy.findFirst({
        where: { tenantId, bookId: dto.bookId, status: 'AVAILABLE' },
      });
      if (!availableCopy) {
        throw new BadRequestException(`No available physical copies for "${book.title}"`);
      }
      copy = availableCopy;
    }

    if (copy.status !== 'AVAILABLE' && copy.status !== 'RESERVED') {
      throw new BadRequestException(`Book copy ${copy.accessionNumber} is not available (Status: ${copy.status})`);
    }

    const issue = await this.prisma.bookIssue.create({
      data: {
        tenantId,
        campusId: dto.campusId || book.campusId || campusId,
        bookId: dto.bookId,
        bookCopyId: copy.id,
        borrowerType: dto.borrowerType || 'STUDENT',
        studentId: dto.studentId || null,
        staffUserId: dto.staffUserId || null,
        issuedByUserId,
        issueDate: new Date(),
        dueDate: new Date(dto.dueDate),
        returnDate: null,
        status: 'ACTIVE',
        renewalsCount: 0,
        maxRenewals: 2,
        returnCondition: null,
        returnNotes: null,
        receivedByUserId: null,
        overdueDays: 0,
        fineAmount: 0,
        finePaidStatus: 'NONE',
      },
    });

    // Update copy status
    await this.prisma.bookCopy.update({
      where: { id: copy.id },
      data: { status: 'ISSUED' },
    });
    await this.catalogService.recalculateBookCounters(tenantId, dto.bookId);

    // Check & fulfill waiting reservation if matches borrower
    if (dto.studentId) {
      const reservation = await this.prisma.bookReservation.findFirst({
        where: {
          tenantId,
          bookId: dto.bookId,
          studentId: dto.studentId,
          status: { in: ['ACTIVE_WAITING', 'READY_FOR_PICKUP'] },
        },
      });
      if (reservation) {
        await this.prisma.bookReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'FULFILLED',
            fulfilledAt: new Date(),
          },
        });
      }
    }

    this.dispatchIssueNotification(tenantId, 'ISSUED', issue, book, borrowerName).catch((err) =>
      this.logger.warn(`Fault-isolated issue alert failed: ${err.message}`),
    );

    return {
      ...issue,
      bookTitle: book.title,
      author: book.author,
      accessionNumber: copy.accessionNumber,
      barcode: copy.barcode,
      borrowerName,
      borrowerIdentifier,
    };
  }

  async returnBook(
    tenantId: string,
    issueId: string,
    receivedByUserId: string,
    dto: ReturnBookDto,
  ) {
    const issue = await this.prisma.bookIssue.findFirst({
      where: { id: issueId, tenantId },
    });
    if (!issue || issue.status === 'RETURNED') {
      throw new BadRequestException('Active book issue not found');
    }

    const now = new Date();
    const dueDate = new Date(issue.dueDate);
    const overdueDays = Math.max(0, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 3600 * 24)));
    const finePerDay = 100.0;
    const calculatedOverdueFine = overdueDays * finePerDay;
    const damageFine = dto.damageFineAmount || 0;
    const totalFine = calculatedOverdueFine + damageFine;

    const updatedIssue = await this.prisma.bookIssue.update({
      where: { id: issueId },
      data: {
        status: 'RETURNED',
        returnDate: now,
        receivedByUserId,
        returnCondition: dto.returnCondition || 'GOOD',
        returnNotes: dto.returnNotes || null,
        overdueDays,
        fineAmount: totalFine,
        finePaidStatus: totalFine > 0 ? 'PENDING' : 'NONE',
      },
    });

    // If fine generated, record LibraryFine
    if (totalFine > 0) {
      await this.prisma.libraryFine.create({
        data: {
          tenantId,
          campusId: issue.campusId,
          issueId,
          studentId: issue.studentId,
          staffUserId: issue.staffUserId,
          overdueDays,
          ratePerDay: finePerDay,
          totalAmount: totalFine,
          paidAmount: 0,
          balanceDue: totalFine,
          status: 'UNPAID',
          waivedByUserId: null,
          waiveReason: null,
          paymentReference: null,
          paidAt: null,
        },
      });
    }

    // Update copy status
    if (issue.bookCopyId) {
      const condition = dto.returnCondition || 'GOOD';
      await this.prisma.bookCopy.update({
        where: { id: issue.bookCopyId },
        data: {
          condition,
          status: condition === 'DAMAGED' ? 'MAINTENANCE' : 'AVAILABLE',
        },
      });
    }

    await this.catalogService.recalculateBookCounters(tenantId, issue.bookId);

    // Promote next reservation if exists
    const nextReservation = await this.prisma.bookReservation.findFirst({
      where: { tenantId, bookId: issue.bookId, status: 'ACTIVE_WAITING' },
      orderBy: { priorityQueue: 'asc' },
    });

    if (nextReservation) {
      await this.prisma.bookReservation.update({
        where: { id: nextReservation.id },
        data: {
          status: 'READY_FOR_PICKUP',
          notifiedAt: now,
          expiryDate: new Date(now.getTime() + 48 * 3600 * 1000), // 48h pickup window
        },
      });
    }

    return updatedIssue;
  }

  async renewBook(tenantId: string, issueId: string, dto: RenewBookDto) {
    const issue = await this.prisma.bookIssue.findFirst({
      where: { id: issueId, tenantId, status: 'ACTIVE' },
    });
    if (!issue) {
      throw new BadRequestException('Active book issue not found');
    }

    if (issue.renewalsCount >= issue.maxRenewals) {
      throw new BadRequestException(`Maximum renewals reached (${issue.maxRenewals} times)`);
    }

    // Check if reserved by another student
    const hasWaitingReservation = await this.prisma.bookReservation.findFirst({
      where: { tenantId, bookId: issue.bookId, status: 'ACTIVE_WAITING' },
    });
    if (hasWaitingReservation) {
      throw new BadRequestException('Cannot renew book because another patron has placed a hold reservation');
    }

    return this.prisma.bookIssue.update({
      where: { id: issueId },
      data: {
        dueDate: new Date(dto.newDueDate),
        renewalsCount: { increment: 1 },
      },
    });
  }

  async listIssues(tenantId: string, filter?: IssueFilterDto) {
    const where: any = { tenantId };
    if (filter?.bookId) where.bookId = filter.bookId;
    if (filter?.studentId) where.studentId = filter.studentId;
    if (filter?.staffUserId) where.staffUserId = filter.staffUserId;
    if (filter?.borrowerType) where.borrowerType = filter.borrowerType;
    if (filter?.status) where.status = filter.status;
    if (filter?.campusId) where.campusId = filter.campusId;

    const list = await this.prisma.bookIssue.findMany({
      where,
      include: {
        book: true,
        bookCopy: true,
        student: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((i) => ({
      ...i,
      bookTitle: i.book?.title || 'Book',
      author: i.book?.author || '',
      accessionNumber: i.bookCopy?.accessionNumber || '',
      borrowerName: i.student ? `${i.student.firstName} ${i.student.lastName}` : 'Staff / Patron',
      admissionNumber: i.student?.admissionNumber || '',
    }));
  }

  async getIssueById(tenantId: string, issueId: string) {
    const issue = await this.prisma.bookIssue.findFirst({
      where: { id: issueId, tenantId },
      include: {
        book: true,
        bookCopy: true,
        student: true,
      },
    });
    if (!issue) {
      throw new NotFoundException(`Book issue with ID ${issueId} not found`);
    }

    return {
      ...issue,
      bookTitle: issue.book?.title || 'Book',
      author: issue.book?.author || '',
      accessionNumber: issue.bookCopy?.accessionNumber || '',
      borrowerName: issue.student ? `${issue.student.firstName} ${issue.student.lastName}` : 'Staff / Patron',
      admissionNumber: issue.student?.admissionNumber || '',
    };
  }

  private async dispatchIssueNotification(
    tenantId: string,
    event: string,
    issue: any,
    book: any,
    borrowerName: string,
  ) {
    try {
      await this.queueService.addJob(
        QUEUES.NOTIFICATIONS,
        `library_${event.toLowerCase()}_${issue.id}`,
        {
          tenantId,
          type: 'LIBRARY_CIRCULATION_ALERT',
          event,
          issueId: issue.id,
          bookTitle: book.title,
          dueDate: issue.dueDate,
          borrowerName,
        },
      );
    } catch (e: any) {
      this.logger.warn(`Could not dispatch library notification: ${e?.message}`);
    }
  }
}
