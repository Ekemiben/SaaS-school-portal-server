import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { BookCatalogService } from '../src/modules/library/services/book-catalog.service.js';
import { LibraryAnalyticsService } from '../src/modules/library/services/library-analytics.service.js';

describe('Library Cataloging & Physical Copy Inventory', () => {
  let moduleRef: TestingModule;
  let catalogService: BookCatalogService;
  let analyticsService: LibraryAnalyticsService;
  let prisma: PrismaService;

  const tenantId = 'tenant_lib_alpha';
  const campusId = 'campus_lib_01';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, QueuesModule],
      providers: [
        BookCatalogService,
        LibraryAnalyticsService,
      ],
    }).compile();

    catalogService = moduleRef.get<BookCatalogService>(BookCatalogService);
    analyticsService = moduleRef.get<LibraryAnalyticsService>(LibraryAnalyticsService);
    prisma = moduleRef.get<PrismaService>(PrismaService);
  });

  it('should catalog a book with ISBN, Dewey Decimal, and auto-generate physical copies', async () => {
    const book = await catalogService.createBook(tenantId, campusId, {
      title: 'New General Mathematics for Senior Secondary Schools 1',
      isbn: '978-0199147106',
      isbn13: '9780199147106',
      author: 'M.F. Macrae et al.',
      publisher: 'Oxford University Press',
      publicationYear: 2024,
      edition: '4th Edition',
      category: 'MATHEMATICS',
      deweyDecimal: '510',
      shelfLocation: 'Aisle 3 - Bay B',
      initialCopies: 3,
    });

    expect(book).toBeDefined();
    expect(book.title).toContain('Mathematics');
    expect(book.deweyDecimal).toBe('510');
    expect(book.totalCopies).toBe(3);
    expect(book.availableCopies).toBe(3);
    expect(book.status).toBe('IN_STOCK');

    const copies = await catalogService.listBookCopies(tenantId, { bookId: book.id });
    expect(copies.length).toBe(3);
    expect(copies[0].accessionNumber).toContain('ACC-');
    expect(copies[0].barcode).toBeDefined();
    expect(copies[0].rfidTag).toBeDefined();
    expect(copies[0].status).toBe('AVAILABLE');
  });

  it('should add additional copies and find copy by barcode or RFID tag', async () => {
    const book = await catalogService.createBook(tenantId, campusId, {
      title: 'Things Fall Apart',
      isbn: '978-0195758368',
      author: 'Chinua Achebe',
      category: 'LITERATURE',
      deweyDecimal: '823',
      initialCopies: 1,
    });

    const newCopy = await catalogService.createBookCopy(tenantId, campusId, {
      bookId: book.id,
      accessionNumber: 'ACC-TFA-002',
      barcode: '9780195758368-SPEC-2',
      rfidTag: 'RFID-TFA-99',
      condition: 'NEW',
    });

    expect(newCopy).toBeDefined();

    // Verify counter update
    const updatedBook = await catalogService.getBookById(tenantId, book.id);
    expect(updatedBook.totalCopies).toBe(2);
    expect(updatedBook.availableCopies).toBe(2);

    // Lookup by barcode
    const foundByBarcode = await catalogService.getBookCopyByBarcode(tenantId, '9780195758368-SPEC-2');
    expect(foundByBarcode.id).toBe(newCopy.id);

    // Lookup by RFID
    const foundByRfid = await catalogService.getBookCopyByBarcode(tenantId, 'RFID-TFA-99');
    expect(foundByRfid.id).toBe(newCopy.id);
  });

  it('should filter catalog by category and Dewey Decimal', async () => {
    await catalogService.createBook(tenantId, campusId, {
      title: 'Senior Secondary Physics',
      author: 'P.N. Okeke',
      category: 'SCIENCES',
      deweyDecimal: '530',
      initialCopies: 2,
    });

    await catalogService.createBook(tenantId, campusId, {
      title: 'Countdown to WASSCE English',
      author: 'Ogunsanwo',
      category: 'LANGUAGES',
      deweyDecimal: '420',
      initialCopies: 2,
    });

    const scienceBooks = await catalogService.listBooks(tenantId, { category: 'SCIENCES' });
    expect(scienceBooks.length).toBe(1);
    expect(scienceBooks[0].author).toBe('P.N. Okeke');

    const deweyBooks = await catalogService.listBooks(tenantId, { deweyDecimal: '420' });
    expect(deweyBooks.length).toBe(1);
    expect(deweyBooks[0].category).toBe('LANGUAGES');
  });
});
