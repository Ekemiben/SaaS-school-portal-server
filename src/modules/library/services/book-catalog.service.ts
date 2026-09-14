import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateBookDto,
  UpdateBookDto,
  CreateBookCopyDto,
  UpdateBookCopyDto,
} from '../dto/create-book.dto.js';
import {
  BookFilterDto,
  BookCopyFilterDto,
} from '../dto/library-filter.dto.js';

@Injectable()
export class BookCatalogService {
  private readonly logger = new Logger(BookCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createBook(tenantId: string, campusId: string, dto: CreateBookDto) {
    const targetCampusId = dto.campusId || campusId;
    const id = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const copiesCount = dto.initialCopies || 1;

    const book = {
      id,
      tenantId,
      campusId: targetCampusId,
      title: dto.title,
      isbn: dto.isbn || null,
      isbn13: dto.isbn13 || null,
      author: dto.author,
      coAuthors: dto.coAuthors || null,
      publisher: dto.publisher || null,
      publicationYear: dto.publicationYear || null,
      edition: dto.edition || null,
      category: dto.category || 'GENERAL_KNOWLEDGE',
      deweyDecimal: dto.deweyDecimal || null,
      shelfLocation: dto.shelfLocation || null,
      description: dto.description || null,
      coverImageUrl: dto.coverImageUrl || null,
      totalCopies: copiesCount,
      availableCopies: copiesCount,
      reservedCopies: 0,
      status: copiesCount > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.books.set(id, book);

    // Auto-generate initial physical copies
    for (let i = 1; i <= copiesCount; i++) {
      const copyId = `cp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${i}`;
      const accessionNumber = `ACC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}-${i}`;
      const barcode = dto.isbn ? `${dto.isbn.replace(/[^0-9]/g, '')}-${i}` : `BC-${Date.now()}-${i}`;

      const copy = {
        id: copyId,
        tenantId,
        campusId: targetCampusId,
        bookId: id,
        accessionNumber,
        barcode,
        rfidTag: `RFID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        condition: 'NEW',
        status: 'AVAILABLE',
        purchasePrice: null,
        acquisitionDate: new Date(),
        notes: 'Initial accession batch',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.prisma.memoryStore.bookCopies.set(copyId, copy);
    }

    this.logger.log(`Created book "${book.title}" with ${copiesCount} copies for tenant ${tenantId}`);
    return book;
  }

  async listBooks(tenantId: string, filter?: BookFilterDto) {
    let list = Array.from(this.prisma.memoryStore.books.values()).filter(
      (b) => b.tenantId === tenantId,
    );

    if (filter?.campusId) list = list.filter((b) => b.campusId === filter.campusId);
    if (filter?.category && filter.category !== 'ALL') list = list.filter((b) => b.category === filter.category);
    if (filter?.deweyDecimal) list = list.filter((b) => b.deweyDecimal === filter.deweyDecimal);
    if (filter?.status) list = list.filter((b) => b.status === filter.status);

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          (b.isbn && b.isbn.toLowerCase().includes(q)) ||
          (b.deweyDecimal && b.deweyDecimal.includes(q)) ||
          (b.shelfLocation && b.shelfLocation.toLowerCase().includes(q)),
      );
    }

    return list.sort((a, b) => a.title.localeCompare(b.title));
  }

  async getBookById(tenantId: string, bookId: string) {
    const book = this.prisma.memoryStore.books.get(bookId);
    if (!book || book.tenantId !== tenantId) {
      throw new NotFoundException(`Book with ID ${bookId} not found`);
    }

    const copies = Array.from(this.prisma.memoryStore.bookCopies.values()).filter(
      (c) => c.tenantId === tenantId && c.bookId === bookId,
    );
    const activeLoans = Array.from(this.prisma.memoryStore.bookIssues.values()).filter(
      (i) => i.tenantId === tenantId && i.bookId === bookId && (i.status === 'ACTIVE' || i.status === 'OVERDUE'),
    );
    const activeReservations = Array.from(this.prisma.memoryStore.bookReservations.values()).filter(
      (r) => r.tenantId === tenantId && r.bookId === bookId && r.status === 'ACTIVE_WAITING',
    );

    return {
      ...book,
      copies,
      activeLoans,
      activeReservations,
    };
  }

  async updateBook(tenantId: string, bookId: string, dto: UpdateBookDto) {
    const book = await this.getBookById(tenantId, bookId);
    if (dto.title) book.title = dto.title;
    if (dto.isbn !== undefined) book.isbn = dto.isbn;
    if (dto.isbn13 !== undefined) book.isbn13 = dto.isbn13;
    if (dto.author) book.author = dto.author;
    if (dto.coAuthors !== undefined) book.coAuthors = dto.coAuthors;
    if (dto.publisher !== undefined) book.publisher = dto.publisher;
    if (dto.publicationYear !== undefined) book.publicationYear = dto.publicationYear;
    if (dto.edition !== undefined) book.edition = dto.edition;
    if (dto.category) book.category = dto.category;
    if (dto.deweyDecimal !== undefined) book.deweyDecimal = dto.deweyDecimal;
    if (dto.shelfLocation !== undefined) book.shelfLocation = dto.shelfLocation;
    if (dto.description !== undefined) book.description = dto.description;
    if (dto.coverImageUrl !== undefined) book.coverImageUrl = dto.coverImageUrl;
    if (dto.status) book.status = dto.status;
    book.updatedAt = new Date();

    this.prisma.memoryStore.books.set(bookId, book);
    return book;
  }

  // --- Copy Management ---

  async createBookCopy(tenantId: string, campusId: string, dto: CreateBookCopyDto) {
    const book = await this.getBookById(tenantId, dto.bookId);

    const existingCopy = Array.from(this.prisma.memoryStore.bookCopies.values()).find(
      (c) => c.tenantId === tenantId && c.accessionNumber.toLowerCase() === dto.accessionNumber.toLowerCase(),
    );
    if (existingCopy) {
      throw new BadRequestException(`Copy with accession number ${dto.accessionNumber} already exists`);
    }

    const id = `cp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const copy = {
      id,
      tenantId,
      campusId: dto.campusId || book.campusId || campusId,
      bookId: dto.bookId,
      accessionNumber: dto.accessionNumber,
      barcode: dto.barcode || null,
      rfidTag: dto.rfidTag || null,
      condition: dto.condition || 'GOOD',
      status: dto.status || 'AVAILABLE',
      purchasePrice: dto.purchasePrice || null,
      acquisitionDate: dto.acquisitionDate ? new Date(dto.acquisitionDate) : new Date(),
      notes: dto.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.bookCopies.set(id, copy);
    await this.recalculateBookCounters(tenantId, dto.bookId);
    return copy;
  }

  async listBookCopies(tenantId: string, filter?: BookCopyFilterDto) {
    let list = Array.from(this.prisma.memoryStore.bookCopies.values()).filter(
      (c) => c.tenantId === tenantId,
    );

    if (filter?.bookId) list = list.filter((c) => c.bookId === filter.bookId);
    if (filter?.status) list = list.filter((c) => c.status === filter.status);
    if (filter?.condition) list = list.filter((c) => c.condition === filter.condition);
    if (filter?.campusId) list = list.filter((c) => c.campusId === filter.campusId);

    return list.sort((a, b) => a.accessionNumber.localeCompare(b.accessionNumber));
  }

  async getBookCopyById(tenantId: string, copyId: string) {
    const copy = this.prisma.memoryStore.bookCopies.get(copyId);
    if (!copy || copy.tenantId !== tenantId) {
      throw new NotFoundException(`Book copy with ID ${copyId} not found`);
    }
    return copy;
  }

  async updateBookCopy(tenantId: string, copyId: string, dto: UpdateBookCopyDto) {
    const copy = await this.getBookCopyById(tenantId, copyId);
    if (dto.accessionNumber) copy.accessionNumber = dto.accessionNumber;
    if (dto.barcode !== undefined) copy.barcode = dto.barcode;
    if (dto.rfidTag !== undefined) copy.rfidTag = dto.rfidTag;
    if (dto.condition) copy.condition = dto.condition;
    if (dto.status) copy.status = dto.status;
    if (dto.purchasePrice !== undefined) copy.purchasePrice = dto.purchasePrice;
    if (dto.notes !== undefined) copy.notes = dto.notes;
    copy.updatedAt = new Date();

    this.prisma.memoryStore.bookCopies.set(copyId, copy);
    await this.recalculateBookCounters(tenantId, copy.bookId);
    return copy;
  }

  async getBookCopyByBarcode(tenantId: string, barcodeOrIdentifier: string) {
    const q = barcodeOrIdentifier.trim().toLowerCase();
    const copy = Array.from(this.prisma.memoryStore.bookCopies.values()).find(
      (c) =>
        c.tenantId === tenantId &&
        ((c.barcode && c.barcode.toLowerCase() === q) ||
          (c.rfidTag && c.rfidTag.toLowerCase() === q) ||
          c.accessionNumber.toLowerCase() === q),
    );
    if (!copy) {
      throw new NotFoundException(`Book copy with tag "${barcodeOrIdentifier}" not found`);
    }
    return copy;
  }

  async recalculateBookCounters(tenantId: string, bookId: string) {
    const book = this.prisma.memoryStore.books.get(bookId);
    if (!book || book.tenantId !== tenantId) return;

    const copies = Array.from(this.prisma.memoryStore.bookCopies.values()).filter(
      (c) => c.tenantId === tenantId && c.bookId === bookId,
    );

    const total = copies.length;
    const available = copies.filter((c) => c.status === 'AVAILABLE').length;
    const reserved = copies.filter((c) => c.status === 'RESERVED').length;

    book.totalCopies = total;
    book.availableCopies = available;
    book.reservedCopies = reserved;
    book.status = available > 0 ? 'IN_STOCK' : total > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK';
    book.updatedAt = new Date();

    this.prisma.memoryStore.books.set(bookId, book);
  }
}
