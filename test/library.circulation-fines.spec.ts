import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { BookCatalogService } from '../src/modules/library/services/book-catalog.service.js';
import { BookCirculationService } from '../src/modules/library/services/book-circulation.service.js';
import { BookReservationService } from '../src/modules/library/services/book-reservation.service.js';
import { LibraryFineService } from '../src/modules/library/services/library-fine.service.js';

describe('Library Circulation, Reservations & Overdue Fines', () => {
  let moduleRef: TestingModule;
  let catalogService: BookCatalogService;
  let circulationService: BookCirculationService;
  let reservationService: BookReservationService;
  let fineService: LibraryFineService;
  let prisma: PrismaService;

  const tenantId = 'tenant_lib_circ';
  const campusId = 'campus_lib_02';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, QueuesModule],
      providers: [
        BookCatalogService,
        BookCirculationService,
        BookReservationService,
        LibraryFineService,
      ],
    }).compile();

    catalogService = moduleRef.get<BookCatalogService>(BookCatalogService);
    circulationService = moduleRef.get<BookCirculationService>(BookCirculationService);
    reservationService = moduleRef.get<BookReservationService>(BookReservationService);
    fineService = moduleRef.get<LibraryFineService>(LibraryFineService);
    prisma = moduleRef.get<PrismaService>(PrismaService);

    // Setup students
    prisma.memoryStore.students.set('std_reader_1', {
      id: 'std_reader_1',
      tenantId,
      campusId,
      admissionNumber: 'ADM-LIB-001',
      firstName: 'Chinedu',
      lastName: 'Okafor',
      status: 'ACTIVE',
    });

    prisma.memoryStore.students.set('std_reader_2', {
      id: 'std_reader_2',
      tenantId,
      campusId,
      admissionNumber: 'ADM-LIB-002',
      firstName: 'Amina',
      lastName: 'Yusuf',
      status: 'ACTIVE',
    });
  });

  it('should issue a book to student, decrement available copies, and prevent exceeding quota', async () => {
    const book = await catalogService.createBook(tenantId, campusId, {
      title: 'Modern Biology for Senior Secondary',
      author: 'S.T. Ramalingam',
      category: 'SCIENCES',
      initialCopies: 1,
    });

    const issue = await circulationService.issueBook(tenantId, campusId, 'librarian_1', {
      bookId: book.id,
      borrowerType: 'STUDENT',
      studentId: 'std_reader_1',
      dueDate: new Date(Date.now() + 14 * 3600 * 24 * 1000).toISOString(),
    });

    expect(issue).toBeDefined();
    expect(issue.status).toBe('ACTIVE');

    const updatedBook = await catalogService.getBookById(tenantId, book.id);
    expect(updatedBook.availableCopies).toBe(0);

    // Attempting to issue when no copies are available
    await expect(
      circulationService.issueBook(tenantId, campusId, 'librarian_1', {
        bookId: book.id,
        borrowerType: 'STUDENT',
        studentId: 'std_reader_2',
        dueDate: new Date(Date.now() + 14 * 3600 * 24 * 1000).toISOString(),
      }),
    ).rejects.toThrow('No available physical copies');
  });

  it('should renew active book issue and enforce max renewals limit', async () => {
    const book = await catalogService.createBook(tenantId, campusId, {
      title: 'Senior Secondary Chemistry',
      author: 'Ababio',
      category: 'SCIENCES',
      initialCopies: 2,
    });

    const issue = await circulationService.issueBook(tenantId, campusId, 'librarian_1', {
      bookId: book.id,
      studentId: 'std_reader_1',
      dueDate: new Date(Date.now() + 7 * 3600 * 24 * 1000).toISOString(),
    });

    // 1st Renewal
    const renewed1 = await circulationService.renewBook(tenantId, issue.id, {
      newDueDate: new Date(Date.now() + 14 * 3600 * 24 * 1000).toISOString(),
    });
    expect(renewed1.renewalsCount).toBe(1);

    // 2nd Renewal
    const renewed2 = await circulationService.renewBook(tenantId, issue.id, {
      newDueDate: new Date(Date.now() + 21 * 3600 * 24 * 1000).toISOString(),
    });
    expect(renewed2.renewalsCount).toBe(2);

    // 3rd Renewal should fail (max 2 renewals)
    await expect(
      circulationService.renewBook(tenantId, issue.id, {
        newDueDate: new Date(Date.now() + 28 * 3600 * 24 * 1000).toISOString(),
      }),
    ).rejects.toThrow('Maximum renewals reached');
  });

  it('should return overdue book, calculate fines, and promote waiting hold reservation', async () => {
    const book = await catalogService.createBook(tenantId, campusId, {
      title: 'Countdown to WASSCE English',
      author: 'Ogunsanwo',
      category: 'LANGUAGES',
      initialCopies: 1,
    });

    // Issue to student 1 with past due date (3 days overdue)
    const pastDueDate = new Date(Date.now() - 3 * 3600 * 24 * 1000);
    const issue = await circulationService.issueBook(tenantId, campusId, 'librarian_1', {
      bookId: book.id,
      studentId: 'std_reader_1',
      dueDate: pastDueDate.toISOString(),
    });

    // Student 2 places reservation on the book
    const reservation = await reservationService.reserveBook(tenantId, campusId, {
      bookId: book.id,
      studentId: 'std_reader_2',
    });
    expect(reservation.status).toBe('ACTIVE_WAITING');

    // Return book by Student 1
    const returned = await circulationService.returnBook(tenantId, issue.id, 'librarian_1', {
      returnCondition: 'GOOD',
      returnNotes: 'Returned in good shape with 3 days delay',
    });

    expect(returned.status).toBe('RETURNED');
    expect(returned.overdueDays).toBeGreaterThanOrEqual(3);
    expect(returned.fineAmount).toBeGreaterThanOrEqual(300.0);

    // Verify fine generated
    const fines = await fineService.listFines(tenantId, { studentId: 'std_reader_1' });
    expect(fines.length).toBe(1);
    expect(fines[0].balanceDue).toBe(returned.fineAmount);

    // Verify reservation promoted to READY_FOR_PICKUP
    const updatedRes = await reservationService.getReservationById(tenantId, reservation.id);
    expect(updatedRes.status).toBe('READY_FOR_PICKUP');

    // Pay Fine
    const paidFine = await fineService.payFine(tenantId, fines[0].id, {
      amount: fines[0].totalAmount,
      paymentReference: 'PAY-LIB-FINE-001',
    });
    expect(paidFine.status).toBe('PAID');
    expect(paidFine.balanceDue).toBe(0);
  });
});
