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
    const existing = Array.from(this.prisma.memoryStore.bookReservations.values()).find(
      (r) =>
        r.tenantId === tenantId &&
        r.bookId === dto.bookId &&
        r.studentId === dto.studentId &&
        (r.status === 'ACTIVE_WAITING' || r.status === 'READY_FOR_PICKUP'),
    );
    if (existing) {
      throw new BadRequestException('Patron already has an active hold reservation for this book');
    }

    const currentQueue = Array.from(this.prisma.memoryStore.bookReservations.values()).filter(
      (r) => r.tenantId === tenantId && r.bookId === dto.bookId && r.status === 'ACTIVE_WAITING',
    );
    const priorityQueue = currentQueue.length + 1;

    const id = `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const reservation = {
      id,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.bookReservations.set(id, reservation);
    await this.catalogService.recalculateBookCounters(tenantId, dto.bookId);

    const student = dto.studentId ? this.prisma.memoryStore.students.get(dto.studentId) : null;
    return {
      ...reservation,
      bookTitle: book.title,
      author: book.author,
      borrowerName: student ? `${student.firstName} ${student.lastName}` : 'Patron',
    };
  }

  async cancelReservation(tenantId: string, reservationId: string) {
    const reservation = this.prisma.memoryStore.bookReservations.get(reservationId);
    if (!reservation || reservation.tenantId !== tenantId) {
      throw new NotFoundException(`Reservation with ID ${reservationId} not found`);
    }

    reservation.status = 'CANCELLED';
    reservation.updatedAt = new Date();
    this.prisma.memoryStore.bookReservations.set(reservationId, reservation);

    await this.catalogService.recalculateBookCounters(tenantId, reservation.bookId);
    return reservation;
  }

  async updateReservation(
    tenantId: string,
    reservationId: string,
    dto: UpdateReservationDto,
  ) {
    const reservation = this.prisma.memoryStore.bookReservations.get(reservationId);
    if (!reservation || reservation.tenantId !== tenantId) {
      throw new NotFoundException(`Reservation with ID ${reservationId} not found`);
    }

    reservation.status = dto.status;
    if (dto.notes) reservation.notes = dto.notes;
    reservation.updatedAt = new Date();

    this.prisma.memoryStore.bookReservations.set(reservationId, reservation);
    await this.catalogService.recalculateBookCounters(tenantId, reservation.bookId);
    return reservation;
  }

  async listReservations(tenantId: string, filter?: ReservationFilterDto) {
    let list = Array.from(this.prisma.memoryStore.bookReservations.values()).filter(
      (r) => r.tenantId === tenantId,
    );

    if (filter?.bookId) list = list.filter((r) => r.bookId === filter.bookId);
    if (filter?.studentId) list = list.filter((r) => r.studentId === filter.studentId);
    if (filter?.status) list = list.filter((r) => r.status === filter.status);
    if (filter?.campusId) list = list.filter((r) => r.campusId === filter.campusId);

    return list.map((r) => {
      const book = this.prisma.memoryStore.books.get(r.bookId);
      const student = r.studentId ? this.prisma.memoryStore.students.get(r.studentId) : null;
      return {
        ...r,
        bookTitle: book?.title || 'Book',
        author: book?.author || '',
        borrowerName: student ? `${student.firstName} ${student.lastName}` : 'Patron',
        admissionNumber: student?.admissionNumber || '',
      };
    });
  }

  async getReservationById(tenantId: string, reservationId: string) {
    const reservation = this.prisma.memoryStore.bookReservations.get(reservationId);
    if (!reservation || reservation.tenantId !== tenantId) {
      throw new NotFoundException(`Reservation with ID ${reservationId} not found`);
    }

    const book = this.prisma.memoryStore.books.get(reservation.bookId);
    const student = reservation.studentId ? this.prisma.memoryStore.students.get(reservation.studentId) : null;

    return {
      ...reservation,
      bookTitle: book?.title || 'Book',
      author: book?.author || '',
      borrowerName: student ? `${student.firstName} ${student.lastName}` : 'Patron',
      admissionNumber: student?.admissionNumber || '',
    };
  }
}
