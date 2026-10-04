import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateBookReservationDto,
  UpdateReservationDto,
} from '../dto/reservation.dto.js';
import { ReservationFilterDto } from '../dto/library-filter.dto.js';
import { BookCatalogService } from './book-catalog.service.js';

@Injectable()
export class BookReservationService {
  private readonly logger = new Logger(BookReservationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: BookCatalogService,
  ) {}

  async reserveBook(
    tenantId: string,
    campusId: string,
    dto: CreateBookReservationDto,
  ) {
    const book = await this.catalogService.getBookById(tenantId, dto.bookId);

    // Check duplicate reservation
    if (dto.studentId) {
      const existing = await this.prisma.bookReservation.findFirst({
        where: {
          tenantId,
          bookId: dto.bookId,
          studentId: dto.studentId,
          status: { in: ['ACTIVE_WAITING', 'READY_FOR_PICKUP'] },
        },
      });
      if (existing) {
        throw new BadRequestException('Patron already has an active hold reservation for this book');
      }
    }

    const currentQueueCount = await this.prisma.bookReservation.count({
      where: {
        tenantId,
        bookId: dto.bookId,
        status: 'ACTIVE_WAITING',
      },
    });
    const priorityQueue = currentQueueCount + 1;

    const reservation = await this.prisma.bookReservation.create({
      data: {
        tenantId,
        campusId: dto.campusId || book.campusId || campusId,
        bookId: dto.bookId,
        borrowerType: dto.borrowerType || 'STUDENT',
        studentId: dto.studentId || null,
        staffUserId: dto.staffUserId || null,
        reservationDate: new Date(),
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        status: 'ACTIVE_WAITING',
        priorityQueue,
        notifiedAt: null,
        fulfilledAt: null,
        notes: dto.notes || null,
      },
      include: {
        student: true,
        book: true,
      },
    });

    await this.catalogService.recalculateBookCounters(tenantId, dto.bookId);

    return {
      ...reservation,
      bookTitle: reservation.book?.title || book.title,
      author: reservation.book?.author || book.author,
      borrowerName: reservation.student
        ? `${reservation.student.firstName} ${reservation.student.lastName}`
        : 'Patron',
    };
  }

  async cancelReservation(tenantId: string, reservationId: string) {
    const reservation = await this.prisma.bookReservation.findFirst({
      where: { id: reservationId, tenantId },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation with ID ${reservationId} not found`);
    }

    const updated = await this.prisma.bookReservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED' },
    });

    await this.catalogService.recalculateBookCounters(tenantId, reservation.bookId);
    return updated;
  }

  async updateReservation(
    tenantId: string,
    reservationId: string,
    dto: UpdateReservationDto,
  ) {
    const reservation = await this.prisma.bookReservation.findFirst({
      where: { id: reservationId, tenantId },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation with ID ${reservationId} not found`);
    }

    const updated = await this.prisma.bookReservation.update({
      where: { id: reservationId },
      data: {
        status: dto.status,
        ...(dto.notes ? { notes: dto.notes } : {}),
      },
    });

    await this.catalogService.recalculateBookCounters(tenantId, reservation.bookId);
    return updated;
  }

  async listReservations(tenantId: string, filter?: ReservationFilterDto) {
    const where: any = { tenantId };
    if (filter?.bookId) where.bookId = filter.bookId;
    if (filter?.studentId) where.studentId = filter.studentId;
    if (filter?.status) where.status = filter.status;
    if (filter?.campusId) where.campusId = filter.campusId;

    const list = await this.prisma.bookReservation.findMany({
      where,
      include: {
        book: true,
        student: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((r) => ({
      ...r,
      bookTitle: r.book?.title || 'Book',
      author: r.book?.author || '',
      borrowerName: r.student ? `${r.student.firstName} ${r.student.lastName}` : 'Patron',
      admissionNumber: r.student?.admissionNumber || '',
    }));
  }

  async getReservationById(tenantId: string, reservationId: string) {
    const reservation = await this.prisma.bookReservation.findFirst({
      where: { id: reservationId, tenantId },
      include: {
        book: true,
        student: true,
      },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation with ID ${reservationId} not found`);
    }

    return {
      ...reservation,
      bookTitle: reservation.book?.title || 'Book',
      author: reservation.book?.author || '',
      borrowerName: reservation.student
        ? `${reservation.student.firstName} ${reservation.student.lastName}`
        : 'Patron',
      admissionNumber: reservation.student?.admissionNumber || '',
    };
  }
}
