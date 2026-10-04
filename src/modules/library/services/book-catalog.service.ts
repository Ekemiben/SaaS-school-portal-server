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
    const copiesCount = Number((dto as any).copies || dto.initialCopies || 1);
    const shelf = (dto as any).shelf || dto.shelfLocation || 'Aisle 1 - Bay A';

    const book = await this.prisma.book.create({
      data: {
        tenantId,
        campusId: targetCampusId,
        title: dto.title,
        isbn: dto.isbn || null,
        isbn13: dto.isbn13 || null,
        author: dto.author,
        coAuthors: dto.coAuthors || null,
        publisher: dto.publisher || null,
        publicationYear: dto.publicationYear ? Number(dto.publicationYear) : null,
        edition: dto.edition || null,
        category: dto.category || 'GENERAL_KNOWLEDGE',
        deweyDecimal: dto.deweyDecimal || null,
        shelfLocation: shelf,
        description: dto.description || null,
        coverImageUrl: dto.coverImageUrl || null,
        totalCopies: copiesCount,
        availableCopies: copiesCount,
        reservedCopies: 0,
        status: copiesCount > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      },
    });

    // Auto-generate initial physical copies
    if (copiesCount > 0) {
      const copiesData = [];
      for (let i = 1; i <= copiesCount; i++) {
        const accessionNumber = `ACC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}-${i}`;
        const barcode = dto.isbn ? `${dto.isbn.replace(/[^0-9]/g, '')}-${i}` : `BC-${Date.now()}-${i}`;
        copiesData.push({
          tenantId,
          campusId: targetCampusId,
          bookId: book.id,
          accessionNumber,
          barcode,
          rfidTag: `RFID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          condition: 'NEW',
          status: 'AVAILABLE',
          purchasePrice: null,
          acquisitionDate: new Date(),
          notes: 'Initial accession batch',
        });
      }
      await this.prisma.bookCopy.createMany({ data: copiesData });
    }

    this.logger.log(`Created book "${book.title}" with ${copiesCount} copies for tenant ${tenantId}`);
    return this.enrichBook(book);
  }

  enrichBook(b: any) {
    const totalCopies = Number(b.totalCopies ?? b.copies ?? 1);
    const availableCopies = Number(b.availableCopies ?? b.available ?? totalCopies);
    return {
      ...b,
      shelf: b.shelf || b.shelfLocation || 'Aisle 1 - Bay A',
      shelfLocation: b.shelfLocation || b.shelf || 'Aisle 1 - Bay A',
      copies: totalCopies,
      totalCopies,
      available: availableCopies,
      availableCopies,
      status: b.status || (availableCopies > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK'),
      loans: b.loans || [],
    };
  }

  async listBooks(tenantId: string, filter?: BookFilterDto) {
    const where: any = { tenantId };
    if (filter?.campusId) where.campusId = filter.campusId;
    if (filter?.category && filter.category !== 'ALL') where.category = filter.category;
    if (filter?.deweyDecimal) where.deweyDecimal = filter.deweyDecimal;
    if (filter?.status) where.status = filter.status;

    if (filter?.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { author: { contains: filter.search, mode: 'insensitive' } },
        { isbn: { contains: filter.search, mode: 'insensitive' } },
        { deweyDecimal: { contains: filter.search, mode: 'insensitive' } },
        { shelfLocation: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const list = await this.prisma.book.findMany({
      where,
      orderBy: { title: 'asc' },
    });

    return list.map((b) => this.enrichBook(b));
  }

  async getBookById(tenantId: string, bookId: string) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, tenantId },
      include: {
        copies: true,
        issues: {
          where: { status: { in: ['ACTIVE', 'OVERDUE'] } },
        },
        reservations: {
          where: { status: 'ACTIVE_WAITING' },
        },
      },
    });
    if (!book) {
      throw new NotFoundException(`Book with ID ${bookId} not found`);
    }

    return {
      ...this.enrichBook(book),
      copies: book.copies,
      activeLoans: book.issues,
      activeReservations: book.reservations,
    };
  }

  async borrowBook(tenantId: string, bookId: string, loanData: any) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, tenantId },
    });
    if (!book) {
      throw new NotFoundException(`Book with ID ${bookId} not found`);
    }

    if (book.availableCopies <= 0) {
      throw new BadRequestException('No copies available to borrow');
    }

    const updated = await this.prisma.book.update({
      where: { id: bookId },
      data: {
        availableCopies: Math.max(0, book.availableCopies - 1),
        status: book.availableCopies - 1 > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      },
    });

    return this.enrichBook(updated);
  }

  async returnBookLoan(tenantId: string, bookId: string, loanIndex?: number) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, tenantId },
    });
    if (!book) {
      throw new NotFoundException(`Book with ID ${bookId} not found`);
    }

    const updated = await this.prisma.book.update({
      where: { id: bookId },
      data: {
        availableCopies: Math.min(book.totalCopies, book.availableCopies + 1),
        status: 'IN_STOCK',
      },
    });

    return this.enrichBook(updated);
  }

  async updateBook(tenantId: string, bookId: string, dto: UpdateBookDto) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, tenantId },
    });
    if (!book) {
      throw new NotFoundException(`Book with ID ${bookId} not found`);
    }

    const updated = await this.prisma.book.update({
      where: { id: bookId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.isbn !== undefined ? { isbn: dto.isbn } : {}),
        ...(dto.isbn13 !== undefined ? { isbn13: dto.isbn13 } : {}),
        ...(dto.author !== undefined ? { author: dto.author } : {}),
        ...(dto.coAuthors !== undefined ? { coAuthors: dto.coAuthors } : {}),
        ...(dto.publisher !== undefined ? { publisher: dto.publisher } : {}),
        ...(dto.publicationYear !== undefined ? { publicationYear: dto.publicationYear ? Number(dto.publicationYear) : null } : {}),
        ...(dto.edition !== undefined ? { edition: dto.edition } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.deweyDecimal !== undefined ? { deweyDecimal: dto.deweyDecimal } : {}),
        ...(dto.shelfLocation !== undefined ? { shelfLocation: dto.shelfLocation } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.coverImageUrl !== undefined ? { coverImageUrl: dto.coverImageUrl } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    return this.enrichBook(updated);
  }

  // --- Copy Management ---

  async createBookCopy(tenantId: string, campusId: string, dto: CreateBookCopyDto) {
    const book = await this.prisma.book.findFirst({
      where: { id: dto.bookId, tenantId },
    });
    if (!book) {
      throw new NotFoundException(`Book with ID ${dto.bookId} not found`);
    }

    const existingCopy = await this.prisma.bookCopy.findFirst({
      where: {
        tenantId,
        accessionNumber: { equals: dto.accessionNumber, mode: 'insensitive' },
      },
    });
    if (existingCopy) {
      throw new BadRequestException(`Copy with accession number ${dto.accessionNumber} already exists`);
    }

    const copy = await this.prisma.bookCopy.create({
      data: {
        tenantId,
        campusId: dto.campusId || book.campusId || campusId,
        bookId: dto.bookId,
        accessionNumber: dto.accessionNumber,
        barcode: dto.barcode || null,
        rfidTag: dto.rfidTag || null,
        condition: dto.condition || 'GOOD',
        status: dto.status || 'AVAILABLE',
        purchasePrice: dto.purchasePrice ? Number(dto.purchasePrice) : null,
        acquisitionDate: dto.acquisitionDate ? new Date(dto.acquisitionDate) : new Date(),
        notes: dto.notes || null,
      },
    });

    await this.recalculateBookCounters(tenantId, dto.bookId);
    return copy;
  }

  async listBookCopies(tenantId: string, filter?: BookCopyFilterDto) {
    const where: any = { tenantId };
    if (filter?.bookId) where.bookId = filter.bookId;
    if (filter?.status) where.status = filter.status;
    if (filter?.condition) where.condition = filter.condition;
    if (filter?.campusId) where.campusId = filter.campusId;

    return this.prisma.bookCopy.findMany({
      where,
      orderBy: { accessionNumber: 'asc' },
    });
  }

  async getBookCopyById(tenantId: string, copyId: string) {
    const copy = await this.prisma.bookCopy.findFirst({
      where: { id: copyId, tenantId },
    });
    if (!copy) {
      throw new NotFoundException(`Book copy with ID ${copyId} not found`);
    }
    return copy;
  }

  async updateBookCopy(tenantId: string, copyId: string, dto: UpdateBookCopyDto) {
    const copy = await this.prisma.bookCopy.findFirst({
      where: { id: copyId, tenantId },
    });
    if (!copy) {
      throw new NotFoundException(`Book copy with ID ${copyId} not found`);
    }

    const updated = await this.prisma.bookCopy.update({
      where: { id: copyId },
      data: {
        ...(dto.accessionNumber !== undefined ? { accessionNumber: dto.accessionNumber } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
        ...(dto.rfidTag !== undefined ? { rfidTag: dto.rfidTag } : {}),
        ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.purchasePrice !== undefined ? { purchasePrice: dto.purchasePrice ? Number(dto.purchasePrice) : null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    await this.recalculateBookCounters(tenantId, updated.bookId);
    return updated;
  }

  async getBookCopyByBarcode(tenantId: string, barcodeOrIdentifier: string) {
    const q = barcodeOrIdentifier.trim();
    const copy = await this.prisma.bookCopy.findFirst({
      where: {
        tenantId,
        OR: [
          { barcode: { equals: q, mode: 'insensitive' } },
          { rfidTag: { equals: q, mode: 'insensitive' } },
          { accessionNumber: { equals: q, mode: 'insensitive' } },
        ],
      },
    });
    if (!copy) {
      throw new NotFoundException(`Book copy with tag "${barcodeOrIdentifier}" not found`);
    }
    return copy;
  }

  async recalculateBookCounters(tenantId: string, bookId: string) {
    const copies = await this.prisma.bookCopy.findMany({
      where: { tenantId, bookId },
    });

    const total = copies.length;
    const available = copies.filter((c) => c.status === 'AVAILABLE').length;
    const reserved = copies.filter((c) => c.status === 'RESERVED').length;

    await this.prisma.book.update({
      where: { id: bookId },
      data: {
        totalCopies: total,
        availableCopies: available,
        reservedCopies: reserved,
        status: available > 0 ? 'IN_STOCK' : total > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK',
      },
    });
  }
}
