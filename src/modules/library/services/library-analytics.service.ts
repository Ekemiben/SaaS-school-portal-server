import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { LibraryStatsFilterDto } from '../dto/library-filter.dto.js';

@Injectable()
export class LibraryAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLibraryStats(tenantId: string, filter?: LibraryStatsFilterDto) {
    const campusWhere = filter?.campusId ? { campusId: filter.campusId } : {};

    const [books, copies, issues, reservations, fines] = await Promise.all([
      this.prisma.book.findMany({
        where: { tenantId, ...campusWhere },
      }),
      this.prisma.bookCopy.findMany({
        where: { tenantId, ...campusWhere },
      }),
      this.prisma.bookIssue.findMany({
        where: { tenantId, ...campusWhere },
      }),
      this.prisma.bookReservation.findMany({
        where: { tenantId, ...campusWhere },
      }),
      this.prisma.libraryFine.findMany({
        where: { tenantId, ...campusWhere },
      }),
    ]);

    const totalTitles = books.length;
    const totalCopies = copies.length;
    const availableCopies = copies.filter((c) => c.status === 'AVAILABLE').length;
    const borrowedCopies = copies.filter((c) => c.status === 'ISSUED').length;
    const activeLoans = issues.filter((i) => i.status === 'ACTIVE').length;
    const overdueLoans = issues.filter((i) => i.status === 'OVERDUE').length;
    const activeReservations = reservations.filter(
      (r) => r.status === 'ACTIVE_WAITING' || r.status === 'READY_FOR_PICKUP',
    ).length;

    // Fines aggregates
    const totalFinesLevied = fines.reduce((acc, f) => acc + f.totalAmount, 0);
    const totalFinesCollected = fines.reduce((acc, f) => acc + f.paidAmount, 0);
    const totalFinesOutstanding = fines.reduce((acc, f) => acc + (f.status !== 'WAIVED' ? f.balanceDue : 0), 0);

    // Top 5 most borrowed books
    const bookBorrowCounts = new Map<string, number>();
    for (const issue of issues) {
      bookBorrowCounts.set(issue.bookId, (bookBorrowCounts.get(issue.bookId) || 0) + 1);
    }

    const booksMap = new Map(books.map((b) => [b.id, b]));
    const topBooks = Array.from(bookBorrowCounts.entries())
      .map(([bookId, count]) => {
        const book = booksMap.get(bookId);
        return {
          bookId,
          title: book?.title || 'Unknown Title',
          author: book?.author || 'Unknown Author',
          category: book?.category,
          borrowCount: count,
        };
      })
      .sort((a, b) => b.borrowCount - a.borrowCount)
      .slice(0, 5);

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const b of books) {
      categoryBreakdown[b.category] = (categoryBreakdown[b.category] || 0) + 1;
    }

    return {
      totalTitles,
      totalCopies,
      availableCopies,
      borrowedCopies,
      activeLoans,
      overdueLoans,
      activeReservations,
      finesSummary: {
        totalLevied: totalFinesLevied,
        totalCollected: totalFinesCollected,
        totalOutstanding: totalFinesOutstanding,
      },
      topBorrowedBooks: topBooks,
      categoryDistribution: categoryBreakdown,
    };
  }

  async getOverdueReport(tenantId: string, campusId?: string) {
    const now = new Date();
    const where: any = {
      tenantId,
      OR: [
        { status: 'OVERDUE' },
        {
          status: 'ACTIVE',
          dueDate: { lt: now },
        },
      ],
    };
    if (campusId) where.campusId = campusId;

    const overdueIssues = await this.prisma.bookIssue.findMany({
      where,
      include: {
        book: true,
        bookCopy: true,
        student: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    return overdueIssues.map((i) => {
      const overdueDays = Math.max(1, Math.ceil((now.getTime() - new Date(i.dueDate).getTime()) / (1000 * 3600 * 24)));

      return {
        issueId: i.id,
        bookTitle: i.book?.title,
        author: i.book?.author,
        accessionNumber: i.bookCopy?.accessionNumber,
        barcode: i.bookCopy?.barcode,
        borrowerName: i.student ? `${i.student.firstName} ${i.student.lastName}` : 'Patron',
        admissionNumber: i.student?.admissionNumber || '',
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        overdueDays,
        estimatedFine: overdueDays * 100.0,
      };
    });
  }
}
