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
      const student = this.prisma.memoryStore.students.get(dto.studentId);
      if (!student || student.tenantId !== tenantId) {
        throw new NotFoundException(`Student with ID ${dto.studentId} not found`);
      }
      borrowerName = `${student.firstName} ${student.lastName}`;
      borrowerIdentifier = student.admissionNumber;

      // Limit active loans to 5
      const activeStudentLoans = Array.from(this.prisma.memoryStore.bookIssues.values()).filter(
        (i) => i.tenantId === tenantId && i.studentId === dto.studentId && (i.status === 'ACTIVE' || i.status === 'OVERDUE'),
      );
      if (activeStudentLoans.length >= 5) {
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
      const availableCopies = Array.from(this.prisma.memoryStore.bookCopies.values()).filter(
        (c) => c.tenantId === tenantId && c.bookId === dto.bookId && c.status === 'AVAILABLE',
      );
      if (availableCopies.length === 0) {
        throw new BadRequestException(`No available physical copies for "${book.title}"`);
      }
      copy = availableCopies[0];
    }

    if (copy.status !== 'AVAILABLE' && copy.status !== 'RESERVED') {
      throw new BadRequestException(`Book copy ${copy.accessionNumber} is not available (Status: ${copy.status})`);
    }

    const id = `iss_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const issue = {
      id,
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
      notes: dto.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.bookIssues.set(id, issue);

    // Update copy status
    copy.status = 'ISSUED';
    copy.updatedAt = new Date();
    this.prisma.memoryStore.bookCopies.set(copy.id, copy);
    await this.catalogService.recalculateBookCounters(tenantId, dto.bookId);

    // Check & fulfill waiting reservation if matches borrower
    const reservation = Array.from(this.prisma.memoryStore.bookReservations.values()).find(
      (r) =>
        r.tenantId === tenantId &&
        r.bookId === dto.bookId &&
        r.studentId === dto.studentId &&
        (r.status === 'ACTIVE_WAITING' || r.status === 'READY_FOR_PICKUP'),
    );
    if (reservation) {
      reservation.status = 'FULFILLED';
      reservation.fulfilledAt = new Date();
      reservation.updatedAt = new Date();
      this.prisma.memoryStore.bookReservations.set(reservation.id, reservation);
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
    const issue = this.prisma.memoryStore.bookIssues.get(issueId);
    if (!issue || issue.tenantId !== tenantId || issue.status === 'RETURNED') {
      throw new BadRequestException('Active book issue not found');
    }

    const now = new Date();
    const dueDate = new Date(issue.dueDate);
    const overdueDays = Math.max(0, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 3600 * 24)));
    const finePerDay = 100.0;
    const calculatedOverdueFine = overdueDays * finePerDay;
    const damageFine = dto.damageFineAmount || 0;
    const totalFine = calculatedOverdueFine + damageFine;

    issue.status = 'RETURNED';
    issue.returnDate = now;
    issue.receivedByUserId = receivedByUserId;
    issue.returnCondition = dto.returnCondition || 'GOOD';
    issue.returnNotes = dto.returnNotes || null;
    issue.overdueDays = overdueDays;
    issue.fineAmount = totalFine;
    issue.finePaidStatus = totalFine > 0 ? 'PENDING' : 'NONE';
    issue.updatedAt = now;

    this.prisma.memoryStore.bookIssues.set(issueId, issue);

    // If fine generated, record LibraryFine
    if (totalFine > 0) {
      const fineId = `fin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const fine = {
        id: fineId,
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
        createdAt: now,
        updatedAt: now,
      };
      this.prisma.memoryStore.libraryFines.set(fineId, fine);
    }

    // Update copy status
    if (issue.bookCopyId) {
      const copy = this.prisma.memoryStore.bookCopies.get(issue.bookCopyId);
      if (copy) {
        copy.condition = dto.returnCondition || copy.condition;
        copy.status = dto.returnCondition === 'DAMAGED' ? 'MAINTENANCE' : 'AVAILABLE';
        copy.updatedAt = now;
        this.prisma.memoryStore.bookCopies.set(copy.id, copy);
      }
    }

    await this.catalogService.recalculateBookCounters(tenantId, issue.bookId);

    // Promote next reservation if exists
    const nextReservation = Array.from(this.prisma.memoryStore.bookReservations.values())
      .filter((r) => r.tenantId === tenantId && r.bookId === issue.bookId && r.status === 'ACTIVE_WAITING')
      .sort((a, b) => a.priorityQueue - b.priorityQueue)[0];

    if (nextReservation) {
      nextReservation.status = 'READY_FOR_PICKUP';
      nextReservation.notifiedAt = now;
      nextReservation.expiryDate = new Date(now.getTime() + 48 * 3600 * 1000); // 48h pickup window
      nextReservation.updatedAt = now;
      this.prisma.memoryStore.bookReservations.set(nextReservation.id, nextReservation);
    }

    return issue;
  }

  async renewBook(tenantId: string, issueId: string, dto: RenewBookDto) {
    const issue = this.prisma.memoryStore.bookIssues.get(issueId);
    if (!issue || issue.tenantId !== tenantId || issue.status !== 'ACTIVE') {
      throw new BadRequestException('Active book issue not found');
    }

    if (issue.renewalsCount >= issue.maxRenewals) {
      throw new BadRequestException(`Maximum renewals reached (${issue.maxRenewals} times)`);
    }

    // Check if reserved by another student
    const hasWaitingReservation = Array.from(this.prisma.memoryStore.bookReservations.values()).some(
      (r) => r.tenantId === tenantId && r.bookId === issue.bookId && r.status === 'ACTIVE_WAITING',
    );
    if (hasWaitingReservation) {
      throw new BadRequestException('Cannot renew book because another patron has placed a hold reservation');
    }

    issue.dueDate = new Date(dto.newDueDate);
    issue.renewalsCount += 1;
    if (dto.notes) issue.notes = dto.notes;
    issue.updatedAt = new Date();

    this.prisma.memoryStore.bookIssues.set(issueId, issue);
    return issue;
  }

  async listIssues(tenantId: string, filter?: IssueFilterDto) {
    let list = Array.from(this.prisma.memoryStore.bookIssues.values()).filter(
      (i) => i.tenantId === tenantId,
    );

    if (filter?.bookId) list = list.filter((i) => i.bookId === filter.bookId);
    if (filter?.studentId) list = list.filter((i) => i.studentId === filter.studentId);
    if (filter?.staffUserId) list = list.filter((i) => i.staffUserId === filter.staffUserId);
    if (filter?.borrowerType) list = list.filter((i) => i.borrowerType === filter.borrowerType);
    if (filter?.status) list = list.filter((i) => i.status === filter.status);
    if (filter?.campusId) list = list.filter((i) => i.campusId === filter.campusId);

    return list.map((i) => {
      const book = this.prisma.memoryStore.books.get(i.bookId);
      const copy = i.bookCopyId ? this.prisma.memoryStore.bookCopies.get(i.bookCopyId) : null;
      const student = i.studentId ? this.prisma.memoryStore.students.get(i.studentId) : null;

      return {
        ...i,
        bookTitle: book?.title || 'Book',
        author: book?.author || '',
        accessionNumber: copy?.accessionNumber || '',
        borrowerName: student ? `${student.firstName} ${student.lastName}` : 'Staff / Patron',
        admissionNumber: student?.admissionNumber || '',
      };
    });
  }

  async getIssueById(tenantId: string, issueId: string) {
    const issue = this.prisma.memoryStore.bookIssues.get(issueId);
    if (!issue || issue.tenantId !== tenantId) {
      throw new NotFoundException(`Book issue with ID ${issueId} not found`);
    }

    const book = this.prisma.memoryStore.books.get(issue.bookId);
    const copy = issue.bookCopyId ? this.prisma.memoryStore.bookCopies.get(issue.bookCopyId) : null;
    const student = issue.studentId ? this.prisma.memoryStore.students.get(issue.studentId) : null;

    return {
      ...issue,
      bookTitle: book?.title || 'Book',
      author: book?.author || '',
      accessionNumber: copy?.accessionNumber || '',
      borrowerName: student ? `${student.firstName} ${student.lastName}` : 'Staff / Patron',
      admissionNumber: student?.admissionNumber || '',
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
